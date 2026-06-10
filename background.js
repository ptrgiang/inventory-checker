'use strict';

let windowId = null;

chrome.action.onClicked.addListener(() => {
  if (windowId !== null) {
    chrome.windows.get(windowId, {}, win => {
      if (chrome.runtime.lastError || !win) {
        openWindow();
      } else {
        chrome.windows.update(windowId, { focused: true });
      }
    });
  } else {
    openWindow();
  }
});

function openWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup/index.html'),
    type: 'popup',
    width: 500,
    height: 640,
  }, win => {
    windowId = win.id;
  });
}

chrome.windows.onRemoved.addListener(id => {
  if (id === windowId) windowId = null;
});
