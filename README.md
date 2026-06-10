# Amazon Inventory Checker

Amazon Inventory Checker is a lightweight Chrome/Edge extension for checking available inventory for multiple Amazon ASINs. It opens a dedicated extension window, sends each ASIN through Amazon's AOD flow, and shows inventory, status, totals, and export options.

Repository: https://github.com/ptrgiang/inventory-checker

## Features

- Check multiple ASINs in one run.
- Supports Amazon US (`amazon.com`) and Canada (`amazon.ca`).
- Accepts ASINs separated by new lines, spaces, or commas.
- De-duplicates valid 10-character ASINs automatically.
- Shows per-ASIN inventory and status.
- Sorts results by ASIN, inventory, or status.
- Exports results as CSV or Excel (`.xlsx`).
- Runs without a backend server, npm install, or build step.

## Project Structure

```text
inventory-checker/
+-- assets/             # Extension icons
+-- popup/
|   +-- index.html      # Extension window UI
|   +-- popup.js        # Inventory check, sorting, CSV, and XLSX export logic
|   +-- style.css       # Extension window styles
+-- background.js       # Opens/focuses the extension popup window
+-- manifest.json       # Chrome extension manifest
+-- README.md           # Install, usage, and publishing notes
```

## Installation

This project is a plain Manifest V3 browser extension. It does not require Node.js, npm, a server, or a build step.

Run this in PowerShell to download the latest `main` branch into `InventoryChecker` under your user folder:

```powershell
$Zip = "$env:TEMP\inventory-checker-main.zip"
$Out = "$env:USERPROFILE\InventoryChecker"
Invoke-WebRequest "https://github.com/ptrgiang/inventory-checker/archive/refs/heads/main.zip" -OutFile $Zip
Remove-Item $Out -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive $Zip -DestinationPath $env:USERPROFILE -Force
Rename-Item "$env:USERPROFILE\inventory-checker-main" "InventoryChecker"
Write-Host "Extension folder: $Out"
```

Then load it in your browser:

1. Open Chrome and go to `chrome://extensions`, or open Edge and go to `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `InventoryChecker` folder printed by the PowerShell command.
5. Pin the extension and click the toolbar icon to open Inventory Checker.

## Usage

1. Make sure you are signed in to the Amazon marketplace you want to check.
2. Open the extension from the browser toolbar.
3. Choose **United States** or **Canada**.
4. Paste ASINs into the text box.
5. Click **Check Inventory** or press `Ctrl+Enter` / `Cmd+Enter`.
6. Review the table, then export as CSV or Excel if needed.

## Notes

- The extension uses the active browser session for Amazon requests. If a check fails, open Amazon in a normal tab, sign in, and try again.
- Amazon page/API behavior can change without notice. If results start returning errors for many ASINs, the AOD response structure may need to be updated.
- Checks are throttled slightly between ASINs to avoid firing requests too aggressively.

## Permissions

The extension requests:

- `scripting`: injects the inventory-checking function into an Amazon tab.
- `tabs`: finds or opens a marketplace tab for checks.
- Host permissions for `amazon.com`, `amazon.ca`, and `data.amazon.com`.

## Development

No dependencies are required. Edit the static extension files directly, then reload the unpacked extension in the browser extension page.

Useful files:

- `manifest.json`: extension metadata, permissions, icons, and entry points.
- `background.js`: toolbar click behavior and popup window management.
- `popup/popup.js`: ASIN parsing, Amazon request logic, table rendering, and exports.
- `popup/style.css`: popup styling.

## Packaging

To publish or share the extension, zip the project contents while keeping `manifest.json` at the zip root. Do not zip the parent directory around the project.

Example zip contents:

```text
assets/
popup/
background.js
manifest.json
README.md
```

## License

No license file is currently included. Add one before public distribution if you want to define reuse rights.
