# Changelog

All notable changes to the **AI Chat** Obsidian plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-09-04

### Added
- **Multi-Provider Architecture**:
  - Support for **Google Antigravity** (`agy`) and **GitHub Copilot** (`copilot`) side-by-side with zero API tokens needed.
  - Independent CLI configurations, WSL settings, extra flags, and active models per provider.
  - Built-in GitHub Copilot model catalog: `gpt-5.2`, `gpt-5`, `claude-3.7-sonnet` (with reasoning effort), `claude-3.5-sonnet`, `o1`, and `o3-mini`.
- **Unified Model & Effort Switcher**:
  - Replaced static select dropdowns with a unified, searchable fuzzy modal.
  - Seamlessly switch provider, model, and reasoning effort (`Low`, `Medium`, `High`) from the **Chat Toolbar**, the **Bottom Status Bar Widget**, or **Settings**.
  - All three UI locations stay synchronized in real time.
- **Provider & Model Attribution**:
  - Each assistant response displays the exact provider and model/effort used to generate that response.
- **Renamed to AI Chat**:
  - Renamed the plugin to **AI Chat** for a clean, provider-agnostic, and safe community presence.
- **Auto-Migration**:
  - Automatically migrates existing v1.0 user configurations to the multi-provider system upon upgrade.

## [1.0.0] - 2026-09-03

### Added
- **Native Antigravity CLI Integration**: Connects directly to local `agy` CLI binary using your Google AI subscription with zero API tokens or per-token fees.
- **Active Document Context Tracking**: Automatically tracks the active vault note and text selection in real-time, passing absolute filesystem paths to the CLI without manual copy-pasting.
- **Dynamic Model & Reasoning Effort Discovery**:
  - Live discovery of models via `agy models` including Gemini 3.8/3.7/3.6 Flash, Gemini 3.1 Pro, Claude Sonnet 4.6 (Thinking), Claude Opus 4.6 (Thinking), and GPT-OSS 120B.
  - Dynamic reasoning effort selector (`Low`, `Medium`, `High`) mapped directly to CLI models.
- **Status Bar Model Switcher**:
  - Live status bar widget (`⚡ Model (Effort)`) in Obsidian's bottom tray with click-to-switch modal and settings toggle.
- **Quick Action Bar**: One-click prompt chips to *Summarize*, *Polish writing*, *Extract tasks*, and *Explain concepts*.
- **Code & Snippet Actions**: One-click *Copy* and *Insert into note at cursor* buttons on markdown code blocks.
- **Session Controls**: Prominent *New Session* button and Command Palette shortcuts.
- **Anti-Slop Native Obsidian UI**: 100% theme-token native design matching Obsidian Dark and Light themes.
