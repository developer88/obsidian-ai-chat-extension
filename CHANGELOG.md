# Changelog

All notable changes to the **Sidecar AI** Obsidian plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.5.0] - 2026-09-06

### Added
- **Process Execution Disclaimer Modal & Setting**:
  - Added an interactive first-launch acknowledgement modal (`ProcessExecutionNoticeModal`) explicitly notifying users about local CLI process execution (`shell: false`) with zero third-party proxies.
  - Added a dedicated "Local process execution permission" toggle in plugin settings.

### Security
- **CLI Shell Metacharacter Sanitization & Validation**:
  - Added strict metacharacter rejection (`/[;&|`$<>]/.test(...)`) in `AgyCliService.sanitizeCliCommand` to guard against command injection or command chaining.
  - Added real-time input validation in settings to prevent saving commands with shell metacharacters.

### Fixed
- **Obsidian Linter Compliance (`obsidianmd/prefer-create-el`)**:
  - Replaced `createEl('div')` calls with Obsidian's dedicated `createDiv()` helper in empty state rendering.

## [3.4.0] - 2026-09-06

### Added
- **Native Obsidian View Actions**:
  - Registered view actions (`New session`, `Sidecar AI settings`) directly into Obsidian's native pane header bar.
- **Marketplace Visual Assets**:
  - Embedded hero interface screenshot into `README.md` for in-app Obsidian Marketplace discovery.

### Changed
- **Native Obsidian UI Polish**:
  - Refactored model switcher, quick action suggestion chips, and view components to strictly use native Obsidian design system tokens (`--background-modifier-form-field`, `--tag-radius`, `--interactive-accent`, `--font-ui-smaller`).
  - Replaced generic AI-style `sparkles` icon with Obsidian's native `sliders-horizontal` configuration icon.
  - Replaced status bar emoji with native `bot` Lucide icon.
  - Streamlined empty state to match native Obsidian sidebars (Backlinks / Search).
  - Stabilized settings section heading to "CLI configuration" across all AI providers.
- **Documentation Overhaul**:
  - Streamlined `README.md` for the Obsidian Marketplace directory and extracted manual/BRAT developer setup into `docs/DEVELOPMENT.md`.
  - Unified all AI provider documentation across repository manifests to strictly feature Google Antigravity, GitHub Copilot, and Pi Coding Agent.

### Fixed
- **Attached Note Context Badge**:
  - Formatted attached document badge to display the clean file basename instead of long absolute/vault paths.
  - Added native tooltip (`aria-label`) displaying the full path and enabled smooth ellipsis text truncation (`...`).
- **Settings Dropdown Text Clipping**:
  - Resolved baseline clipping of dropdown text across Obsidian themes by adjusting vertical padding and minimum height.

## [3.3.1] - 2026-09-06

### Changed
- **Obsidian 1.13+ Declarative Settings API**:
  - Implemented `getSettingDefinitions()` on `AntigravitySettingTab` to enable full settings search indexing in Obsidian 1.13.0+.
  - Migrated settings to declarative items and grouped controls.
- **Security & Permissions Disclosures**:
  - Added comprehensive security disclosures in `README.md` clarifying that `child_process.spawn` is used exclusively for executing local AI CLI binaries (`agy`, `copilot`, `pi`) and clipboard access is strictly write-only for user-initiated code copying.

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
