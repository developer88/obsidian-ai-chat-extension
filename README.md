# Antigravity AI for Obsidian (`agy-in-obsidian`)

An OS-agnostic Obsidian plugin that embeds a native AI chat sidebar connected to the **Antigravity CLI** (`agy`), powered by your **Google AI subscription** subscription without needing an API token.

---

## ✨ Features

- 🔐 **Zero API Keys Required**: Connects directly to your local `agy` CLI session, utilizing your existing Google AI subscription quota and models.
- 🌐 **OS-Agnostic**: Works across **macOS**, **Linux**, and **Windows** (including native Windows and WSL `wsl agy`).
- 📄 **Active Document Awareness**: Automatically tracks your currently opened note and active text selection in Obsidian, linking them into prompts without copying and pasting.
- ⚡ **Quick Action Bar**: One-click buttons to **Summarize**, **Polish & Edit**, **Extract Tasks**, and **Explain Key Concepts** for the active note.
- 🔄 **Restart Session Button**: Prominent `🔄` button in the sidebar header to clear conversation memory and start a fresh session on demand.
- 💬 **Native Markdown Rendering**: Real-time streaming with full support for Obsidian markdown, callouts, and math LaTeX.
- 📥 **Direct Note Insertion**: One-click "Insert into Note at Cursor" and "Copy" on code blocks and snippets.

---

## 🚀 Installation & Setup

### Prerequisites
1. Install and authenticate **Antigravity CLI** (`agy`):
   ```bash
   agy
   ```
   Follow the on-screen prompts to sign in with your Google account.

### Building & Installing the Plugin
1. Open your terminal in **WSL** (or Linux/macOS) and navigate to the plugin folder:
   ```bash
   npm install
   npm run build
   ```
2. Copy the resulting files (`main.js`, `manifest.json`, `styles.css`) into your Obsidian vault:
   `<Your-Vault>/.obsidian/plugins/agy-in-obsidian/`
3. Open Obsidian **Settings -> Community Plugins**, reload plugins, and enable **Antigravity AI**.
4. Click the 🤖 robot icon on the left ribbon or run **"Open Antigravity Chat Sidebar"** from the Command Palette (`Ctrl/Cmd + P`).

---

## ⚙️ Configuration

In Obsidian **Settings -> Antigravity AI Settings**:
- **CLI Command / Path**: Default is `agy`. If using a custom path, specify `/usr/local/bin/agy` or `agy.cmd`.
- **Use WSL**: Enable if your `agy` is installed inside WSL on a Windows machine.
- **Auto-Attach Active Note**: Automatically includes the currently active note in prompts.
- **Extra CLI Flags**: Add custom flags like `--dangerously-skip-permissions` or `--mode=plan`.

---

## 📄 License
MIT


