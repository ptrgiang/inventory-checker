'use strict';

const QUANTITY = 309999;

// ── DOM refs ──────────────────────────────────────────────────
const asinInput      = document.getElementById('asin-input');
const checkBtn       = document.getElementById('check-btn');
const clearBtn       = document.getElementById('clear-btn');
const copyBtn        = document.getElementById('copy-btn');
const progressEl     = document.getElementById('progress');
const progressBarWrap = document.getElementById('progress-bar-wrap');
const progressBar    = document.getElementById('progress-bar');
const summaryEl      = document.getElementById('summary');
const resultsWrap    = document.getElementById('results-wrap');
const tbody          = document.getElementById('results-body');
const asinCountEl    = document.getElementById('asin-count');

// ── This function is injected into an Amazon tab and runs there ──
// (same-origin XHR → no CORS, cookies included automatically)
function getStockInPage(asin, quantity) {
  const xhrGet = url => new Promise((res, rej) => {
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.open('GET', url);
    xhr.onreadystatechange = () => { if (xhr.readyState === 4) res(xhr.responseText); };
    xhr.onerror = () => rej(new Error('XHR GET failed'));
    xhr.send();
  });

  const xhrPost = (url, headers, body) => new Promise((res, rej) => {
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.onreadystatechange = () => { if (xhr.readyState === 4) res(xhr.responseText); };
    xhr.onerror = () => rej(new Error('XHR POST failed'));
    xhr.send(body);
  });

  return (async () => {
    try {
      // 1. Fetch AOD page
      const html = await xhrGet(
        `/gp/product/ajax/aodAjaxMain/ref=dp_aod_new_mbc?asin=${asin}&pc=dp`
      );
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const endpointRaw = doc.querySelector('#aod-atc-ajax-endpoint')?.value;
      const token       = doc.querySelector('#aod-atc-csrf-token')?.value;
      if (!endpointRaw || !token) return { error: 'AOD endpoint/token not found' };

      const pinned = doc.querySelector('#aod-container #aod-pinned-offer')
                  || doc.querySelector('#aod-container #aod-offer-list .aod-information-block');

      let qs = '', offerListingId = '';
      const atcRaw = pinned
        ?.querySelector('[data-action="aod-atc-action"][data-aod-atc-action]')
        ?.getAttribute('data-aod-atc-action');

      if (atcRaw) {
        try {
          const d = JSON.parse(atcRaw);
          qs = [['ref', d.refTag], ['sr', d.sr], ['qid', d.qid]]
            .filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
          if (d.oid) offerListingId = decodeURIComponent(d.oid);
        } catch {}
      }

      const rawId = pinned?.querySelector('input[name="offerListingID"]')?.value || offerListingId;
      if (rawId) offerListingId = decodeURIComponent(rawId);

      // 2. POST qty=309999
      const url  = `https://${endpointRaw}` + (qs ? `?${qs}` : '');
      const body = JSON.stringify({
        items: [{ asin, offerListingId, quantity, additionalParameters: {} }]
      });

      const responseText = await xhrPost(url, {
        'Accept-Language':  'en-US',
        'Accept':           'application/vnd.com.amazon.api+json; type="cart.add-items/v1"',
        'Content-Type':     'application/vnd.com.amazon.api+json; type="cart.add-items.request/v1"',
        'x-api-csrf-token': token,
      }, body);

      // 3. Parse
      const item = JSON.parse(responseText)?.entity?.items?.[0];
      if (!item) return { error: 'No item in response' };

      const qty = item.quantity ?? 0;

      const fragments = item.responseMessage?.detailed?.fragments ?? [];
      const msg = fragments.map(f => f.text ?? '').join('');

      const m = msg.match(/only (\d+) left/i)
             || msg.match(/than the (\d+) available/i)
             || msg.match(/limit of (\d+) per customer/i);
      const inventory = m ? parseInt(m[1]) : qty;
      const status = /limit/i.test(msg) ? 'LIMIT' : 'NORMAL';

      return { inventory, msg, status };
    } catch (e) {
      return { error: e.message };
    }
  })();
}

// ── Marketplace ───────────────────────────────────────────────

let selectedDomain = 'www.amazon.com';

document.querySelectorAll('.market-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.market-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedDomain = btn.dataset.domain;
    // Reset shared tab so next check opens the right domain
    sharedTabId = null;
  });
});

// ── Tab management ────────────────────────────────────────────

let sharedTabId = null;

async function getAmazonTab() {
  const [existing] = await chrome.tabs.query({
    url: `https://${selectedDomain}/*`,
    status: 'complete',
  });
  if (existing) { sharedTabId = existing.id; return existing.id; }

  const tab = await chrome.tabs.create({ url: `https://${selectedDomain}`, active: false });
  await new Promise(resolve => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
  sharedTabId = tab.id;
  return tab.id;
}

async function getStock(asin, tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: getStockInPage,
    args: [asin, QUANTITY],
  });
  return result.result;
}

// ── Live ASIN counter ─────────────────────────────────────────

function updateAsinCount() {
  const asins = parseAsins(asinInput.value);
  if (asins.length > 0) {
    asinCountEl.textContent = `${asins.length}`;
    asinCountEl.classList.add('has-asins');
  } else {
    asinCountEl.textContent = '';
    asinCountEl.classList.remove('has-asins');
  }
}

asinInput.addEventListener('input', updateAsinCount);

// Ctrl+Enter shortcut
asinInput.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') checkBtn.click();
});

// ── Table sort ────────────────────────────────────────────────

let sortState = { col: -1, dir: 1 };

document.querySelectorAll('thead th.sortable').forEach(th => {
  th.addEventListener('click', () => sortTable(parseInt(th.dataset.col, 10)));
});

function sortTable(col) {
  const ths = [...document.querySelectorAll('thead th.sortable')];
  sortState.dir = sortState.col === col ? -sortState.dir : 1;
  sortState.col = col;

  ths.forEach((th, i) => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (i === col) th.classList.add(sortState.dir === 1 ? 'sort-asc' : 'sort-desc');
  });

  const rows = [...tbody.querySelectorAll('tr')];
  rows.sort((a, b) => {
    const av = a.cells[col].textContent.trim();
    const bv = b.cells[col].textContent.trim();
    if (col === 1) {
      const an = parseInt(av.replace(/\D/g, ''), 10) || 0;
      const bn = parseInt(bv.replace(/\D/g, ''), 10) || 0;
      return (an - bn) * sortState.dir;
    }
    return av.localeCompare(bv) * sortState.dir;
  });
  rows.forEach(r => tbody.appendChild(r));
}

// ── Table row management ──────────────────────────────────────

function addRow(asin) {
  const tr = document.createElement('tr');
  tr.id = `row-${asin}`;
  tr.innerHTML = `
    <td class="asin"><a href="https://${selectedDomain}/dp/${asin}?th=1" target="_blank">${asin}</a></td>
    <td class="inventory"><span class="skeleton" style="width:44px"></span></td>
    <td class="status"><span class="skeleton" style="width:58px;border-radius:20px"></span></td>
  `;
  tbody.appendChild(tr);
}

function updateRow(asin, result) {
  const tr = document.getElementById(`row-${asin}`);
  if (!tr) return;
  if (result?.error) {
    tr.cells[1].className = 'inventory';
    tr.cells[1].textContent = '—';
    tr.cells[2].innerHTML = `<span class="badge badge-error" title="${result.error}">ERROR</span>`;
    return;
  }
  const inv = result.inventory;
  const invClass = inv === 0 ? 'inv-zero' : inv < 10 ? 'inv-low' : inv >= 100 ? 'inv-high' : '';
  tr.cells[1].className = `inventory${invClass ? ' ' + invClass : ''}`;
  tr.cells[1].textContent = inv.toLocaleString();
  const cls = result.status === 'LIMIT' ? 'badge-limit' : 'badge-normal';
  tr.cells[2].innerHTML = `<span class="badge ${cls}" title="${result.msg ?? ''}">${result.status}</span>`;
}

// ── Main flow ─────────────────────────────────────────────────

function parseAsins(raw) {
  return [...new Set(
    raw.split(/[\n,\s]+/)
       .map(s => s.trim().toUpperCase())
       .filter(s => /^[A-Z0-9]{10}$/.test(s))
  )];
}

const delay = ms => new Promise(r => setTimeout(r, ms));

checkBtn.addEventListener('click', async () => {
  const asins = parseAsins(asinInput.value);
  if (!asins.length) { progressEl.textContent = 'No valid ASINs found.'; return; }

  tbody.innerHTML = '';
  resultsWrap.hidden = false;
  checkBtn.disabled = true;
  summaryEl.textContent = '';
  progressEl.textContent = 'Opening Amazon tab…';

  // Reset progress bar
  progressBar.style.width = '0%';
  progressBarWrap.classList.add('visible');

  let tabId;
  try {
    tabId = await getAmazonTab();
  } catch (e) {
    progressEl.textContent = 'Failed to open Amazon tab.';
    progressBarWrap.classList.remove('visible');
    checkBtn.disabled = false;
    return;
  }

  asins.forEach(addRow);

  let done = 0;
  progressEl.textContent = `0 / ${asins.length}`;

  for (const asin of asins) {
    try {
      const result = await getStock(asin, tabId);
      updateRow(asin, result);
    } catch (e) {
      updateRow(asin, { error: e.message });
    }
    done++;
    progressEl.textContent = `${done} / ${asins.length}`;
    progressBar.style.width = `${Math.round((done / asins.length) * 100)}%`;
    await delay(600);
  }

  // Summary with total inventory
  const errors = [...tbody.querySelectorAll('.badge-error')].length;
  const total = [...tbody.querySelectorAll('tr')].reduce((sum, tr) => {
    const n = parseInt(tr.cells[1].textContent.replace(/\D/g, ''), 10);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const totalStr = total > 0 ? ` · Total: ${total.toLocaleString()}` : '';
  summaryEl.textContent = errors
    ? `${asins.length} checked · ${errors} error${errors > 1 ? 's' : ''}${totalStr}`
    : `${asins.length} checked${totalStr}`;

  progressEl.textContent = 'Done';
  setTimeout(() => progressBarWrap.classList.remove('visible'), 800);
  checkBtn.disabled = false;
});

clearBtn.addEventListener('click', () => {
  asinInput.value = '';
  updateAsinCount();
  tbody.innerHTML = '';
  resultsWrap.hidden = true;
  progressEl.textContent = '';
  summaryEl.textContent = '';
  progressBarWrap.classList.remove('visible');
  sortState = { col: -1, dir: 1 };
  document.querySelectorAll('thead th.sortable').forEach(th =>
    th.classList.remove('sort-asc', 'sort-desc')
  );
  sharedTabId = null;
  asinInput.focus();
});

copyBtn.addEventListener('click', () => {
  const rows = [...tbody.querySelectorAll('tr')];
  const csv = [
    'ASIN,Inventory,Status',
    ...rows.map(tr => {
      const [asin, inv, status] = [...tr.cells].map(td => td.textContent.trim());
      return `${asin},${inv},${status}`;
    }),
  ].join('\n');
  navigator.clipboard.writeText(csv).then(() => {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="2"/></svg> CSV`;
    }, 1500);
  });
});

// ── Export to Excel (Office Open XML .xlsx — no library needed) ──
const excelBtn = document.getElementById('excel-btn');

excelBtn.addEventListener('click', () => {
  const rows = [...tbody.querySelectorAll('tr')].map(tr => {
    const [asin, inv, status] = [...tr.cells].map(td => td.textContent.trim());
    return { asin, inv, status };
  });
  if (!rows.length) return;

  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([buildXLSX(rows)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `inventory_${date}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function buildXLSX(rows) {
  const enc = new TextEncoder();
  const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // cellXfs indices: 0=default, 1=header, 2=asin, 3=num, 4=error, 5=normal, 6=limit
  const statusStyle = st => st === 'ERROR' ? 4 : st === 'LIMIT' ? 6 : 5;

  const sheetData = rows.map(({ asin, inv, status }, i) => {
    const r      = i + 2;
    const invNum = parseInt(inv.replace(/\D/g, ''), 10);
    const invCell = Number.isFinite(invNum)
      ? `<c r="B${r}" s="3"><v>${invNum}</v></c>`
      : `<c r="B${r}" t="inlineStr"><is><t>${esc(inv)}</t></is></c>`;
    return `<row r="${r}"><c r="A${r}" s="2" t="inlineStr"><is><t>${esc(asin)}</t></is></c>${invCell}<c r="C${r}" s="${statusStyle(status)}" t="inlineStr"><is><t>${esc(status)}</t></is></c></row>`;
  }).join('');

  const files = [
    { name: '[Content_Types].xml', data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`)
    },
    { name: '_rels/.rels', data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`)
    },
    { name: 'xl/workbook.xml', data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="Inventory" sheetId="1" r:id="rId1"/></sheets>` +
      `</workbook>`)
    },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`)
    },
    { name: 'xl/styles.xml', data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="6">` +
        `<font><sz val="11"/><name val="Calibri"/></font>` +
        `<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>` +
        `<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFCF222E"/></font>` +
        `<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF1A7F37"/></font>` +
        `<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF9A6700"/></font>` +
        `<font><sz val="11"/><name val="Courier New"/></font>` +
      `</fonts>` +
      `<fills count="6">` +
        `<fill><patternFill patternType="none"/></fill>` +
        `<fill><patternFill patternType="gray125"/></fill>` +
        `<fill><patternFill patternType="solid"><fgColor rgb="FF217346"/></patternFill></fill>` +
        `<fill><patternFill patternType="solid"><fgColor rgb="FFFFEBE9"/></patternFill></fill>` +
        `<fill><patternFill patternType="solid"><fgColor rgb="FFDAFBE1"/></patternFill></fill>` +
        `<fill><patternFill patternType="solid"><fgColor rgb="FFFFF3C4"/></patternFill></fill>` +
      `</fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="7">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>` +
        `<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf>` +
        `<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>` +
        `<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>` +
        `<xf numFmtId="0" fontId="4" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>` +
      `</cellXfs>` +
      `</styleSheet>`)
    },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `<cols>` +
        `<col min="1" max="1" width="16" customWidth="1"/>` +
        `<col min="2" max="2" width="13" customWidth="1"/>` +
        `<col min="3" max="3" width="12" customWidth="1"/>` +
      `</cols>` +
      `<sheetData>` +
        `<row r="1"><c r="A1" s="1" t="inlineStr"><is><t>ASIN</t></is></c><c r="B1" s="1" t="inlineStr"><is><t>Inventory</t></is></c><c r="C1" s="1" t="inlineStr"><is><t>Status</t></is></c></row>` +
        sheetData +
      `</sheetData>` +
      `</worksheet>`)
    },
  ];

  return zipFiles(files);
}

function zipFiles(files) {
  const crcTab = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTab[n] = c;
  }
  const crc32 = buf => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = crcTab[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };

  const enc = new TextEncoder();
  const locals = [], central = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nm  = enc.encode(name);
    const crc = crc32(data);
    const sz  = data.length;

    const lh = new Uint8Array(30 + nm.length + sz);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0,  0x04034B50, true);
    lv.setUint16(4,  20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, sz, true);
    lv.setUint32(22, sz, true);
    lv.setUint16(26, nm.length, true);
    lh.set(nm, 30); lh.set(data, 30 + nm.length);
    locals.push(lh);

    const cd = new Uint8Array(46 + nm.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0,  0x02014B50, true);
    cv.setUint16(4,  20, true);
    cv.setUint16(6,  20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, sz, true);
    cv.setUint32(24, sz, true);
    cv.setUint16(28, nm.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nm, 46);
    central.push(cd);

    offset += lh.length;
  }

  const cdStart = offset;
  const cdSize  = central.reduce((s, b) => s + b.length, 0);
  const eocd    = new Uint8Array(22);
  const ev      = new DataView(eocd.buffer);
  ev.setUint32(0,  0x06054B50, true);
  ev.setUint16(8,  files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);

  const total  = locals.reduce((s, b) => s + b.length, 0) + cdSize + 22;
  const result = new Uint8Array(total);
  let pos = 0;
  for (const b of locals)  { result.set(b, pos); pos += b.length; }
  for (const b of central) { result.set(b, pos); pos += b.length; }
  result.set(eocd, pos);
  return result;
}
