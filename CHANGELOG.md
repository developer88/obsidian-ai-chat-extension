# Changelog

All notable changes to the **Sidecar AI** Obsidian plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
