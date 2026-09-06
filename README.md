# Sidecar AI for Obsidian

[![Obsidian](https://img.shields.io/badge/Obsidian-v1.13.0+-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md)
[![Version](https://img.shields.io/badge/Version-v3.2.1-blue)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20WSL-brightgreen)](#)

A native, privacy-first AI chat companion for **[Obsidian](https://obsidian.md)** powered by your local AI CLI providers—including **Google Antigravity** (`agy`) and **GitHub Copilot** (`copilot`)—with **zero API keys or per-token charges required**.

---

## ✨ Why Sidecar AI?

Most AI plugins for Obsidian require you to manage paid third-party API tokens, configure proxies, or paste secret keys into plugin settings.

**Sidecar AI** connects directly to authenticated local command-line tools already installed on your machine. It utilizes your existing subscriptions (such as **Google AI subscriptions** or **GitHub Copilot**) and provides a native, unified chat sidebar that integrates directly with your vault workflow.

---

## 🚀 Key Features

* 🔌 **Multi-Provider Support (v2.0)**:
  * **Google Antigravity** (`agy`): Powered by your Google AI subscription (Gemini 3.8 Flash, 3.7 Flash, 3.1 Pro, Claude Sonnet 4.6, Claude Opus 4.6, GPT-OSS 120B).
  * **GitHub Copilot** (`copilot`): Powered by your GitHub Copilot subscription (GPT-5.2, GPT-5, Claude 3.7 Sonnet, Claude 3.5 Sonnet, OpenAI o1, OpenAI o3-mini).
  * Modular architecture ready for future providers (Claude CLI, Ollama, etc.).
* 🔐 **Zero API Keys Needed**: Connects directly to authenticated local binaries via CLI execution.
* 🌐 **100% OS-Agnostic**: Native support for **Windows**, **macOS**, **Linux**, and **WSL** (`wsl agy` / `wsl copilot`).
* 🎯 **Unified Model & Reasoning Effort Switcher**:
  * Clean, searchable fuzzy modal used across the **Chat Toolbar**, **Bottom Status Bar widget**, and **Settings tab**.
  * Switch providers, models, and reasoning efforts (`Low`, `Medium`, `High`) in a single click.
* 📄 **Active Note & Selection Tracking**: Automatically links the file path and active highlighted text of your current note without manual copy-pasting.
* 🏷️ **Clear Attribution**: Assistant responses display the exact provider, model, and effort used to generate the output.
* 🔘 **Quick Action Bar**: One-click prompt chips to **Summarize**, **Polish writing**, **Extract tasks**, and **Explain concepts** from your active note.
* 🔄 **Session Management**: Dedicated *New Session* button to clear conversation memory and restart context on demand.
* 📋 **Code Snippet Actions**: One-click buttons to *Copy* or *Insert into note at cursor* on all generated snippets.
* 🎨 **Obsidian Native Design System**: Adheres strictly to Obsidian theme tokens in both Dark and Light modes.

---

## 📦 Installation

### Option 1: Obsidian BRAT (Recommended for Beta)
1. Install the **[BRAT](https://github.com/TfTHacker/obsidian42-brat)** plugin from Obsidian Community Plugins.
2. Open **Command Palette** (`Ctrl/Cmd + P`) and run `BRAT: Add a beta plugin for testing`.
3. Enter the repository URL:
   ```text
   https://github.com/<your-username>/agy-in-obsidian
   ```
4. Enable **Sidecar AI** in Settings → Community Plugins.

---

### Option 2: Manual Installation from Release
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub Release](../../releases).
2. Create a folder in your vault:
   ```text
   <Your-Vault>/.obsidian/plugins/sidecar-ai/
   ```
3. Copy the 3 downloaded files into that folder.
4. Reload plugins in Obsidian **Settings → Community Plugins** and toggle on **Sidecar AI**.

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
Copy `main.js`, `manifest.json`, and `styles.css` to `<Your-Vault>/.obsidian/plugins/sidecar-ai/`.

---

## 🔧 Prerequisites & Setup

### For Google Antigravity
1. Install the `agy` CLI binary.
2. Sign in once in your terminal:
   ```bash
   agy
   ```

### For GitHub Copilot
1. Install the GitHub Copilot CLI (`copilot`):
   ```bash
   # Windows (via WinGet)
   winget install GitHub.Copilot

   # Or via npm/homebrew/official installer
   ```
2. Authenticate in your terminal:
   ```bash
   copilot login
   ```

---

## ⚙️ Settings

| Setting | Default | Description |
| :--- | :--- | :--- |
| **Active AI Provider** | `Google Antigravity` | Choose between `Google Antigravity` and `GitHub Copilot`. |
| **Active Model & Effort** | *(Dynamic)* | Opens the unified fuzzy modal to switch provider, model, and reasoning effort. |
| **Provider CLI Command** | `agy` / `copilot` | Executable path for the selected provider. |
| **Run in WSL** | `false` | Enable if the provider CLI is installed inside Ubuntu/WSL on Windows. |
| **Extra CLI Flags** | *(empty)* | Optional extra command-line flags per provider. |
| **Auto-Attach Active Note** | `true` | Automatically includes the active note file reference and selection in prompts. |
| **Auto-Scroll Chat** | `true` | Automatically scrolls chat to bottom during streaming responses. |
| **Show Status Bar Item** | `true` | Toggles the active provider/model widget in Obsidian's bottom status bar. |

---

## ⌨️ Command Palette Shortcuts

| Command | Action |
| :--- | :--- |
| `Sidecar AI: Open Sidecar AI Sidebar` | Opens or reveals the Sidecar AI sidebar view. |
| `Sidecar AI: Switch Model, Provider & Effort` | Opens the fuzzy search modal to switch models and effort. |
| `Sidecar AI: Restart Session (New Chat)` | Resets the conversation context and starts fresh. |

---

## 📄 License

This plugin is licensed under the [MIT License](LICENSE).

---

## 🤖 Development & Transparency

* This extension was built using **Google Gemini AI**.
* Each change, implementation detail, and line of code was reviewed and verified by the author.
