# Changelog

All notable changes to the **Antigravity AI** Obsidian plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-03

### Added
- **Native Antigravity CLI Integration**: Connects directly to local `agy` CLI binary using your Google AI subscription with zero API tokens or per-token fees.
- **Active Document Context Tracking**: Automatically tracks the active vault note and text selection in real-time, passing absolute filesystem paths to the CLI without manual copy-pasting.
- **Dynamic Model & Reasoning Effort Discovery**:
  - Live discovery of models via `agy models` including Gemini 3.8/3.7/3.6 Flash, Gemini 3.1 Pro, Claude Sonnet 4.6 (Thinking), Claude Opus 4.6 (Thinking), and GPT-OSS 120B.
  - Dynamic reasoning effort selector (`Low`, `Medium`, `High`) mapped directly to CLI models.
- **Status Bar Model Switcher**:
  - Live status bar widget (`⚡ Model (Effort)`) in Obsidian's bottom tray with click-to-switch modal and settings toggle.
- **Model Attribution on Responses**: Assistant messages display the exact model and reasoning effort used for each response.
- **Quick Action Bar**: One-click prompt chips to *Summarize*, *Polish writing*, *Extract tasks*, and *Explain concepts*.
- **Code & Snippet Actions**: One-click *Copy* and *Insert into note at cursor* buttons on markdown code blocks.
- **Session Controls**: Prominent *New Session* button and Command Palette shortcuts (`Open Antigravity Chat Sidebar`, `Switch Model & Reasoning Effort`, `Restart Antigravity Session`).
- **Anti-Slop Native Obsidian UI**: 100% theme-token native design matching Obsidian Dark and Light themes.
