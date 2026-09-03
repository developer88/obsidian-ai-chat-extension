# Antigravity AI for Obsidian

[![Obsidian](https://img.shields.io/badge/Obsidian-v1.0.0+-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20WSL-brightgreen)](#)

A native, privacy-first AI companion for **[Obsidian](https://obsidian.md)** powered by your local **[Antigravity CLI](https://antigravity.google)** (`agy`) and **Google AI subscriptions**—with **zero API keys or per-token charges required**.

---

## ✨ Why Antigravity in Obsidian?

Most AI plugins for Obsidian require you to manage paid third-party API tokens, configure proxies, or paste your API keys into plugin settings. 

**Antigravity AI** connects directly to your authenticated local `agy` command-line session on your machine. It utilizes your existing Google AI subscription quota (Google One AI Premium, Gemini Advanced, Workspace, etc.) and provides a native, seamless chat sidebar that follows your vault workflow.

---

## 🚀 Key Features

* 🔐 **Zero API Keys Needed**: Seamlessly connects to your authenticated local `agy` binary.
* 🌐 **100% OS-Agnostic**: Full native support for **Windows**, **macOS**, **Linux**, and **WSL** (`wsl agy`).
* 📄 **Active Note & Selection Tracking**: Automatically links the file path and active highlighted text of whatever note you are working on.
* 🧠 **Dynamic Model & Thinking Effort Selection**:
  * Autodiscovers available models (`Gemini 3.8 Flash`, `Gemini 3.7 Flash`, `Claude Sonnet 4.6`, `Claude Opus 4.6`, `GPT-OSS 120B`, etc.).
  * Dedicated Reasoning / Thinking Effort selector (`Low`, `Medium`, `High`) that dynamically shows only for supported models.
* ⚡ **Status Bar Switcher Widget**: Quick-switch active models and reasoning effort from Obsidian's bottom status bar tray or via Command Palette (`Ctrl/Cmd + P`).
* 🔘 **Quick Action Bar**: One-click chips to **Summarize**, **Polish writing**, **Extract tasks**, and **Explain concepts** from the active note.
* 🔄 **Session Management**: Dedicated *New Session* button to clear conversation memory and restart context on demand.
* 📋 **Code Snippet Actions**: One-click buttons to *Copy* or *Insert into note at cursor* for generated code and text snippets.
* 🎨 **Obsidian Native Design System**: Adheres strictly to Obsidian theme tokens in both Dark and Light modes (no generic AI glows or clunky styling).

---

## 📦 Installation

### Option 1: Obsidian BRAT (Quick Beta Install)
1. Install the **[BRAT](https://github.com/TfTHacker/obsidian42-brat)** plugin from Obsidian Community Plugins.
2. Open **Command Palette** (`Ctrl/Cmd + P`) and run `BRAT: Add a beta plugin for testing`.
3. Enter the repository URL:
   ```text
   https://github.com/<your-username>/agy-in-obsidian
   ```
4. Enable **Antigravity AI** in Settings → Community Plugins.

---

### Option 2: Manual Installation from Release
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub Release](../../releases).
2. Create a folder in your vault:
   ```text
   <Your-Vault>/.obsidian/plugins/agy-in-obsidian/
   ```
3. Copy the 3 downloaded files into that folder.
4. Reload plugins in Obsidian **Settings → Community Plugins** and toggle on **Antigravity AI**.

---

### Option 3: Build from Source
```bash
# Clone the repository
git clone https://github.com/<your-username>/agy-in-obsidian.git
cd agy-in-obsidian

# Install dependencies and build
npm install
npm run build
```
Copy `main.js`, `manifest.json`, and `styles.css` to `<Your-Vault>/.obsidian/plugins/agy-in-obsidian/`.

---

## 🔧 Prerequisites & Setup

1. Make sure you have **Antigravity CLI (`agy`)** installed on your system.
2. Sign in to your Google AI account once in your terminal:
   ```bash
   agy
   ```
3. Open Obsidian, click the **Antigravity AI** robot icon in the ribbon (or press `Ctrl/Cmd + P` and search for `Open Antigravity Chat Sidebar`).

---

## ⚙️ Settings

| Setting | Default | Description |
| :--- | :--- | :--- |
| **CLI Command / Path** | `agy` | Path to the Antigravity CLI binary (e.g. `agy`, `agy.exe`, `/usr/local/bin/agy`). |
| **Use WSL** | `false` | Enable if your `agy` is installed inside Ubuntu / WSL on Windows. |
| **Auto-Attach Active Note** | `true` | Automatically includes the active note file reference and selection in prompts. |
| **Auto-Scroll Chat** | `true` | Automatically scrolls chat to bottom during streaming responses. |
| **Extra CLI Flags** | *(empty)* | Optional extra command-line flags to pass to `agy` (e.g. `--mode=plan`). |

---

## ⌨️ Command Palette Shortcuts

| Command | Action |
| :--- | :--- |
| `Antigravity: Open Antigravity Chat Sidebar` | Opens or reveals the AI chat sidebar view. |
| `Antigravity: Switch Model & Reasoning Effort` | Opens the fuzzy search modal to switch models and effort. |
| `Antigravity: Restart Antigravity Session (New Chat)` | Resets the conversation context and starts fresh. |

---

## 📄 License

This plugin is licensed under the [MIT License](LICENSE).
