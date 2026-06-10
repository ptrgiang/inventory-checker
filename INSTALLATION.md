# Installation and Publishing

This project is a plain Manifest V3 browser extension. It does not require Node.js, npm, a server, or a build step.

## Requirements

- Google Chrome, Microsoft Edge, or another Chromium-based browser.
- An Amazon account signed in to the marketplace you want to check.
- The project files from https://github.com/ptrgiang/inventory-checker.

## Install Locally in Chrome

1. Download or clone the repository.
2. Open Chrome.
3. Go to `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the `inventory-checker` folder that contains `manifest.json`.
7. Pin **Amazon Inventory Checker** from the extensions menu.
8. Click the extension icon to open the checker window.

## Install Locally in Microsoft Edge

1. Download or clone the repository.
2. Open Edge.
3. Go to `edge://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the `inventory-checker` folder that contains `manifest.json`.
7. Pin **Amazon Inventory Checker** from the extensions menu.
8. Click the extension icon to open the checker window.

## Update an Unpacked Install

After editing or pulling new files:

1. Open `chrome://extensions` or `edge://extensions`.
2. Find **Amazon Inventory Checker**.
3. Click the reload button on the extension card.
4. Reopen the extension window.

## Create a Release Zip

The Chrome Web Store and manual distribution expect `manifest.json` at the root of the zip.

From the project folder on Windows PowerShell:

```powershell
Compress-Archive -Path assets,popup,background.js,manifest.json,README.md,INSTALLATION.md -DestinationPath inventory-checker.zip -Force
```

Verify the zip contains:

```text
assets/
popup/
background.js
manifest.json
README.md
INSTALLATION.md
```

If the zip contains an outer `inventory-checker/` folder before `manifest.json`, recreate the zip from inside the project folder.

## Publish to GitHub

1. Create the GitHub repository at `ptrgiang/inventory-checker` if it does not already exist.
2. Initialize git in this folder if needed:

```powershell
git init
git branch -M main
git add .
git commit -m "Add inventory checker extension"
```

3. Add the GitHub remote and push:

```powershell
git remote add origin https://github.com/ptrgiang/inventory-checker.git
git push -u origin main
```

If the remote already exists, use:

```powershell
git remote set-url origin https://github.com/ptrgiang/inventory-checker.git
git push -u origin main
```

## Publish to the Chrome Web Store

1. Create `inventory-checker.zip` using the release zip instructions above.
2. Open the Chrome Web Store Developer Dashboard.
3. Create a new item and upload the zip.
4. Fill in the listing details, screenshots, privacy practices, and support information.
5. Confirm that the requested permissions match the extension behavior:
   - `scripting`
   - `tabs`
   - `https://www.amazon.com/*`
   - `https://www.amazon.ca/*`
   - `https://data.amazon.com/*`
6. Submit for review.

## Troubleshooting

### The extension does not appear after loading

Make sure you selected the folder containing `manifest.json`, not the parent folder.

### Checks return errors

Open the selected Amazon marketplace in a normal tab, sign in, and retry. If many ASINs fail at once, Amazon may have changed the AOD page or cart API response.

### Results are empty

Confirm that the input values are valid 10-character ASINs. Invalid entries are ignored.

### Chrome says the manifest is invalid

Check that the zip or folder has `manifest.json` at the root and that the JSON is valid.
