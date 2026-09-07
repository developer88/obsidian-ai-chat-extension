---
name: release-management
description: >-
  Rules and procedures for testing, preparing, and publishing releases of the Sidecar AI Obsidian plugin.
  Activate when preparing a new release, bumping versions, updating CHANGELOG.md, or publishing tags.
---

# Release Management Skill

This skill enforces testing requirements, test failure handling protocols, and user-facing release notes guidelines for the Sidecar AI plugin.

---

## 1. Mandatory Pre-Release Testing

Before creating or proposing any release (version bump, git tag, or GitHub release):

1. **Always run the test suite and typecheck first**:
   ```bash
   # Run npm exclusively inside WSL per user global rule
   wsl -- npm run typecheck
   wsl -- npm test
   ```
2. **Never initiate or finalize a release without running tests**:
   - Running the build command (`npm run build`) is not sufficient on its own.
   - Tests and typechecks must be explicitly executed and verified prior to tagging or bumping versions.

---

## 2. All Tests Must Be Green

1. **Zero-Failure Requirement**:
   - All tests in the test suite must pass (`pass 100%`, exit code `0`).
   - Even if a failing test appears completely unrelated to the changes intended for the current release, **do not ignore it, bypass it, or proceed with the release**.
2. **Handling Unrelated Test Failures**:
   - If an unrelated test fails:
     1. Stop the release process immediately.
     2. Notify the user with exact details of the failure (failing test name, error message, stack trace/assertion diff, and file location).
     3. Ask the user for explicit guidance on next steps before taking any further release actions.

---

## 3. User-Facing Release Notes & Changelogs

When preparing a release, updating `CHANGELOG.md`, generating GitHub release notes, or summarizing the release for users:

1. **Include ONLY user-facing information**:
   - User-visible features and capabilities (e.g., new providers, UI improvements, settings options, keyboard shortcuts).
   - Bug fixes that directly affect user behavior, stability, or compatibility (e.g., resolving CLI detection on macOS, fixing display issues).
   - Security disclosures and permission changes relevant to plugin consumers.
2. **Omit internal and developer-only concerns**:
   - **Do NOT** include internal refactoring details that don't alter user behavior.
   - **Do NOT** include test-related work (e.g., "added unit tests", "added test suite", "configured tsx runner", "CI test step").
   - **Do NOT** include build script tweaks, lint configs, or internal repository maintenance unless they directly affect how end users install or run the plugin.
3. **Keep the tone clear and benefit-oriented**:
   - Describe what the user can now do or what annoying issue was resolved for them.

---

## 4. Release Checklist

1. [ ] Run `wsl -- npm run typecheck`.
2. [ ] Run `wsl -- npm test`. Ensure all tests pass. If any test fails, notify user and pause.
3. [ ] Determine SemVer bump (Major / Minor / Patch).
4. [ ] Bump version in `package.json` and `manifest.json`.
5. [ ] Update `CHANGELOG.md` with **user-facing changes only** under `## [X.Y.Z] - YYYY-MM-DD`.
6. [ ] Build the release artifact: `wsl -- npm run build`.
7. [ ] Copy updated `main.js`, `manifest.json`, and `styles.css` to the local Obsidian testing vault if requested.
8. [ ] Commit, tag `X.Y.Z`, and push to remote.
