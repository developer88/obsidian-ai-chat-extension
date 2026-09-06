# Changelog

All notable changes to the **Sidecar AI** Obsidian plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.0] - 2026-09-06

### Added
- **Pi Coding Agent (`pi`) Provider Support**:
  - Full native support for Pi Coding Agent CLI (`pi` / `@earendil-works/pi-coding-agent`).
  - Searchable model selection with reasoning thinking controls (`Off`, `Low`, `Medium`, `High`, `Max`).
  - Dynamic model discovery from local Pi CLI (`pi --list-models`).
  - Multi-platform execution support on Windows (`pi.cmd`), macOS, Linux, and WSL (`wsl pi`).
  - Closed-stdin stream handling to avoid waiting on piped input in CLI non-interactive mode.
  - Automated release descriptions extracting changelog entries directly into GitHub releases.

## [3.2.1] - 2026-09-06

### Changed
- **Obsidian 1.13+ Settings & UI Compliance**:
  - Replaced imperative `this.display()` refreshes with `this.update()` in settings tab.
  - Ensured all button callback handlers return `void` to eliminate unhandled promise warnings.
  - Formatted command titles and UI labels to sentence case.
  - Added `--generate-notes` to GitHub release workflow for automated release descriptions.

## [3.2.0] - 2026-09-06

### Changed
- **Linter & Style Polish**:
  - Set `minAppVersion` to `1.13.0` to fully support modern Obsidian APIs (including `ButtonComponent.setDestructive()`).
  - Removed redundant plugin title and "settings" from settings tab headings.
  - Renamed general settings heading to "Vault integration and display" to avoid generic "General" naming.
  - Replaced `createEl('span')` with `createSpan()`.
  - Replaced all `!important` in CSS with increased selector specificity.
  - Handled asynchronous operations in event handlers to avoid returning promises to void signatures.
  - Automated release pipeline with GitHub Artifact Attestations (`actions/attest@v4`).

## [3.1.0] - 2026-09-06

### Changed
- **Obsidian Community Review Compliance**:
  - Replaced direct style assignments with Obsidian's `setCssStyles`.
  - Upgraded settings headings to `Setting.setHeading()`.
  - Updated command names to remove redundant plugin name prefix.
  - Resolved all unhandled promises and popout-compatible `window.setTimeout()` calls.
  - Replaced `builtin-modules` with native Node.js `node:module` import.
  - Bumped `minAppVersion` to `1.0.0` for modern Obsidian API compatibility.

## [3.0.0] - 2026-09-06

### Changed
- **Official Rebranding to Sidecar AI**:
  - Plugin ID established as `sidecar-ai` and display name set to **Sidecar AI**, fully compliant with Obsidian Community Plugin guidelines.
  - Upgraded release version to `3.0.0`.

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
- **Renamed to Obsichat**:
  - Renamed the plugin to **Obsichat** for a clean, provider-agnostic, and safe community presence.
- **Auto-Migration**:
  - Automatically migrates existing v1.0 user configurations to the multi-provider system upon upgrade.
