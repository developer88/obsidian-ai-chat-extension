# Development & Manual Installation Guide

This document contains instructions for installing **Sidecar AI** outside of the official Obsidian Community Plugins directory and guidelines for contributing to development.

---

## 📦 Manual Installation Options

### Option 1: Obsidian BRAT (Beta Testing)
1. Install the **[BRAT](https://github.com/TfTHacker/obsidian42-brat)** plugin from Obsidian Community Plugins.
2. Open **Command Palette** (`Ctrl/Cmd + P`) and run `BRAT: Add a beta plugin for testing`.
3. Enter the repository URL:
   ```text
   https://github.com/developer88/obsidian-ai-chat-extension
   ```
4. Enable **Sidecar AI** in **Settings → Community Plugins**.

---

### Option 2: Manual Installation from GitHub Release
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub Release](https://github.com/developer88/obsidian-ai-chat-extension/releases/latest).
2. Open your Obsidian vault directory in your file manager and locate or create:
   ```text
   <Your-Vault>/.obsidian/plugins/sidecar-ai/
   ```
3. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
4. In Obsidian, navigate to **Settings → Community Plugins**, click **Reload plugins**, and toggle on **Sidecar AI**.

---

## 🛠️ Building from Source

### Prerequisites
- Node.js 18+
- npm

### Build Instructions
```bash
# 1. Clone repository
git clone https://github.com/developer88/obsidian-ai-chat-extension.git
cd obsidian-ai-chat-extension

# 2. Install dependencies
npm install

# 3. Development watch mode
npm run dev

# 4. Production build
npm run build
```

The build command bundles the code using `esbuild` into:
- `main.js`
- `manifest.json`
- `styles.css`

Copy these three files to your vault's plugin directory (`.obsidian/plugins/sidecar-ai/`).

---

## 🧪 Verification & Typechecking
```bash
npx tsc --noEmit --skipLibCheck
npm run build
```
