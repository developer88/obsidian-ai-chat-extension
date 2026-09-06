# Sidecar AI

A native, privacy-first AI chat companion for **Obsidian** powered directly by your authenticated local CLI tools: **Google Antigravity** (`agy`), **GitHub Copilot** (`copilot`), and **Pi Coding Agent** (`pi`) with **zero API keys, proxies, or per-token charges**.

---

## ✨ Why Sidecar AI?

Most AI plugins for Obsidian require you to manage paid third-party API tokens, configure proxies, or paste secret keys into plugin settings.

**Sidecar AI** bridges your vault directly to the authenticated command-line agents already running on your machine. It utilizes your existing subscriptions (**Google AI subscriptions**, **GitHub Copilot**, and **Pi Coding Agent**) in a native sidebar designed to match Obsidian's interface.

---

## ⚡ Quick Start

1. **Install & Enable**: Click **Install** and then **Enable** in Obsidian Settings → Community Plugins.
2. **Ensure CLI is Ready**: Make sure at least one supported tool is installed and logged in:
   - **Google Antigravity**: run `agy` in your terminal.
   - **GitHub Copilot**: run `copilot login` in your terminal.
   - **Pi Coding Agent**: install via `npm install -g @earendil-works/pi-coding-agent` and run `pi`.
3. **Open Sidecar AI**:
   - Click the **Sidecar AI bot icon** in the left ribbon, or
   - Press `Ctrl/Cmd + P` and select `Sidecar AI: Open Sidecar AI Sidebar`.
4. **Chat with Context**: Ask questions, summarize notes, or select text in your active note to query the AI assistant.

---

## 🔌 Supported Providers

| Provider | CLI Tool | Authentication / Subscription | Supported Models |
| :--- | :--- | :--- | :--- |
| **Google Antigravity** | `agy` | Google AI Subscription | Gemini 3.8 Flash, 3.7 Flash, 3.1 Pro, Claude Sonnet 4.6, Claude Opus 4.6, GPT-OSS 120B |
| **GitHub Copilot** | `copilot` | GitHub Copilot Subscription | GPT-5.2, GPT-5, Claude 3.7 Sonnet, Claude 3.5 Sonnet, OpenAI o1, OpenAI o3-mini |
| **Pi Coding Agent** | `pi` | Local / Configured Providers | Configurable models with Thinking controls (`Off`, `Low`, `Medium`, `High`, `Max`) |

---

## 🚀 Key Features

* 🔐 **Zero API Keys Needed**: Interacts directly with authenticated local CLI processes. No keys or billing details are ever stored in Obsidian.
* 🌐 **Cross-Platform & WSL Support**: Native execution on Windows, macOS, Linux, and Windows Subsystem for Linux (`wsl`).
* 🎯 **Unified Model & Reasoning Switcher**: A single fuzzy-search modal accessible from the chat header, the bottom status bar widget, and plugin settings to switch providers, models, and reasoning effort levels on the fly.
* 📄 **Active Note & Selection Tracking**: Automatically references your currently focused note path and text selection as context.
* 🏷️ **Clear Attribution**: Every assistant response clearly displays the provider, model, and reasoning effort used.
* 🔘 **Quick Action Bar**: One-click prompt chips to **Summarize**, **Polish writing**, **Extract tasks**, and **Explain concepts** from your active note.
* 🔄 **Session Management**: Dedicated *Restart Session* button to clear conversation memory and restart context on demand.
* 📋 **Code Snippet Actions**: One-click buttons to *Copy* code blocks or *Insert into note at cursor*.
* 🎨 **Obsidian Native Design**: Uses Obsidian's theme tokens for both Dark and Light modes.

---

## ⚙️ Settings Overview

| Setting | Default | Description |
| :--- | :--- | :--- |
| **Active AI provider** | `Google Antigravity` | Choose between `Google Antigravity` (`agy`), `GitHub Copilot` (`copilot`), and `Pi Coding Agent` (`pi`). |
| **Active model and reasoning effort** | *(Dynamic)* | View current model and effort, search available models, or query the CLI dynamically. |
| **CLI command or path** | `agy` / `copilot` / `pi` | Executable command name or absolute path for the selected provider. |
| **Run in WSL** | `false` | Enable if the provider CLI is installed inside Ubuntu/WSL on Windows. |
| **Extra CLI flags** | *(empty)* | Custom arguments passed on each invocation (e.g. `--thinking high`, `--allow-all-tools`). |
| **Auto-attach active note** | `true` | Automatically includes the active note file reference and selection in prompts. |
| **Auto-scroll chat** | `true` | Automatically scrolls the chat container as responses stream in. |
| **Show status bar item** | `true` | Shows the active provider and model status bar widget. |
| **Reset conversation memory** | — | Clears saved session ID and starts fresh on the next prompt. |

---

## 🔒 Security & System Permissions

Sidecar AI uses a privacy-first, zero-telemetry architecture:

- **Shell Execution (`child_process.spawn`)**:
  - The plugin spawns local CLI processes solely to communicate with your user-installed and authenticated AI CLI tools (`agy`, `copilot`, `pi`).
  - It executes exclusively the command configured in Settings (prefixed with `wsl` if enabled), passing user prompts via standard CLI arguments and reading streaming output via stdout. No background scripts, remote downloads, or arbitrary commands are executed.
- **Clipboard Access (`navigator.clipboard.writeText`)**:
  - Clipboard access is strictly **write-only**.
  - It is triggered solely when you explicitly click the "Copy" button on code blocks in the chat UI.
  - The plugin **never** reads, inspects, or monitors system clipboard contents.

---

## ⌨️ Command Palette Shortcuts

| Command | Action |
| :--- | :--- |
| `Sidecar AI: Open Sidecar AI Sidebar` | Opens or reveals the Sidecar AI sidebar view. |
| `Sidecar AI: Switch Model, Provider & Effort` | Opens the fuzzy search modal to switch models and effort. |
| `Sidecar AI: Restart Session (New Chat)` | Resets the conversation context and starts fresh. |

---

## 📚 Advanced Setup & Manual Installation

For instructions on building from source, manual installation from GitHub releases, or installing via Obsidian BRAT for beta testing, see the [Development & Manual Installation Guide](docs/DEVELOPMENT.md).

---

## 📄 License

Licensed under the [MIT License](LICENSE).

---

## 🤖 Development & Transparency

* This extension was built using **Google Gemini AI**.
* Each change, implementation detail, and line of code was reviewed and verified by the author.

