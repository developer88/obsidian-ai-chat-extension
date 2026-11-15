import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Normalize WSL/Linux Playwright environment to avoid Windows path leaks
if (process.platform === 'linux') {
	delete process.env.LOCALAPPDATA;
	delete process.env.USERPROFILE;
	process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.env.HOME || '/home/andrey', '.cache/ms-playwright');
}

const { chromium } = await import('playwright');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const screenshotsDir = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(screenshotsDir)) {
	fs.mkdirSync(screenshotsDir, { recursive: true });
}

const fixturePath = path.resolve(__dirname, 'fixture.html');

function findChromiumExecutable() {
	const candidates = [
		'/home/andrey/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell',
		'/home/andrey/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
		path.join(process.env.HOME || '/home/andrey', '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
		path.join(process.env.HOME || '/home/andrey', '.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell')
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

async function runScreenshotTests() {
	console.log('[Visual E2E] Launching headless browser for screenshot testing...');
	const executablePath = findChromiumExecutable();
	const browser = await chromium.launch({
		executablePath,
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
	});

	const context = await browser.newContext({
		viewport: { width: 1200, height: 900 },
		deviceScaleFactor: 2 // High-DPI (Retina) crisp screenshots
	});

	const page = await context.newPage();
	await page.goto(`file://${fixturePath}`);

	// =========================================================================
	// Scene 1: Chat View (Dark Theme)
	// =========================================================================
	console.log('[Visual E2E] Capturing Scene 1: Chat View (Dark Theme)...');
	await page.evaluate(() => {
		document.documentElement.className = 'theme-dark';
		const root = document.getElementById('root');
		root.innerHTML = `
			<div class="test-container">
				<div class="agy-chat-root">
					<!-- Header -->
					<div class="agy-header">
						<div class="agy-title-group">
							<div class="agy-title-icon">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4V4a2 2 0 0 1 2-2z"/></svg>
							</div>
							<span class="agy-title-text">Sidecar AI</span>
							<span class="agy-session-badge">notes/overview.md</span>
						</div>
						<div class="agy-header-actions">
							<button class="agy-icon-btn" title="New session">
								<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
							</button>
							<button class="agy-icon-btn" title="Settings">
								<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
							</button>
						</div>
					</div>

					<!-- Model Selector Bar -->
					<div class="agy-model-bar">
						<button class="agy-model-trigger-btn">
							<span class="agy-model-trigger-icon">
								<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>
							</span>
							<span class="agy-model-trigger-label">Google Antigravity - Gemini 3.8 Flash (Medium effort)</span>
							<span class="agy-model-trigger-chevron">
								<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
							</span>
						</button>
						<button class="agy-refresh-btn" title="Refresh models">
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
						</button>
					</div>

					<!-- Quick Actions -->
					<div class="agy-quick-actions">
						<button class="agy-action-chip">Summarize</button>
						<button class="agy-action-chip">Polish writing</button>
						<button class="agy-action-chip">Extract tasks</button>
						<button class="agy-action-chip">Explain concepts</button>
					</div>

					<!-- Message List -->
					<div class="agy-messages" style="height: 380px; overflow-y: auto; padding: 12px;">
						<!-- User Turn -->
						<div class="agy-msg-wrapper agy-msg-user">
							<div class="agy-msg-bubble">
								<div class="agy-msg-header">
									<span class="agy-msg-role">You</span>
									<span class="agy-msg-time">10:42 PM</span>
								</div>
								<div class="agy-msg-content">Can you review the multi-provider implementation in <a href="file:///vault/src/main.ts#L40-L75" class="agy-file-link">src/main.ts#L40-L75</a>?</div>
							</div>
						</div>

						<!-- Assistant Turn -->
						<div class="agy-msg-wrapper agy-msg-assistant" style="margin-top: 12px;">
							<div class="agy-msg-bubble">
								<div class="agy-msg-header">
									<div class="agy-assistant-meta">
										<span class="agy-meta-badge prov-badge">Antigravity</span>
										<span class="agy-meta-badge model-badge">gemini-3.8-flash</span>
										<span class="agy-meta-badge effort-badge">Medium</span>
									</div>
									<button class="agy-icon-btn copy-btn" title="Copy response">
										<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
									</button>
								</div>
								<div class="agy-msg-content">
									<p>The multi-provider architecture cleanly isolates each CLI configuration while enabling dynamic model switching.</p>
									<p>Referenced implementation in <a href="file:///vault/src/settings.ts#L33" class="agy-file-link">src/settings.ts#L33</a>:</p>
									<pre style="background: var(--background-secondary-alt); padding: 10px; border-radius: 6px; font-family: var(--font-monospace); font-size: 12px; margin: 8px 0;"><code>const PROVIDER_IDS: AiProviderId[] = [
  'antigravity',
  'copilot',
  'pi',
  'claude',
  'codex'
];</code></pre>
								</div>
							</div>
						</div>
					</div>

					<!-- Footer Input -->
					<div class="agy-footer">
						<div class="agy-input-container">
							<textarea class="agy-input" placeholder="Ask AI about notes/overview.md..." rows="2"></textarea>
							<div class="agy-input-actions">
								<button class="agy-submit-btn" title="Send prompt">
									<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;
	});

	const chatDarkPath = path.join(screenshotsDir, '01_chat_view_dark.png');
	const container1 = await page.$('.test-container');
	await container1.screenshot({ path: chatDarkPath });
	console.log(`[Visual E2E] Saved: ${chatDarkPath}`);

	// =========================================================================
	// Scene 2: Chat View (Light Theme)
	// =========================================================================
	console.log('[Visual E2E] Capturing Scene 2: Chat View (Light Theme)...');
	await page.evaluate(() => {
		document.documentElement.className = 'theme-light';
	});
	const chatLightPath = path.join(screenshotsDir, '02_chat_view_light.png');
	await container1.screenshot({ path: chatLightPath });
	console.log(`[Visual E2E] Saved: ${chatLightPath}`);

	// =========================================================================
	// Scene 3: Settings View (Multi-Provider Collapsible Cards)
	// =========================================================================
	console.log('[Visual E2E] Capturing Scene 3: Settings View (Collapsible Cards)...');
	await page.evaluate(() => {
		document.documentElement.className = 'theme-dark';
		const root = document.getElementById('root');
		root.innerHTML = `
			<div class="test-container wide" style="padding: 24px;">
				<h2 style="margin-top: 0; font-size: 18px; padding-bottom: 8px;">AI providers</h2>
				<p style="color: var(--text-muted); font-size: 12px; margin-bottom: 16px;">Configure multiple AI CLI providers simultaneously. Enable the providers you use and switch between them dynamically.</p>

				<div class="setting-group-items" style="border: 1px solid var(--divider-color); border-radius: 8px; overflow: hidden; background: var(--background-secondary);">
					<!-- Card 1: Google Antigravity (Expanded) -->
					<div class="setting-item agy-provider-setting-container">
						<details class="agy-provider-card" open>
							<summary class="agy-provider-summary">
								<div class="agy-provider-summary-left">
									<span class="agy-provider-chevron">
										<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
									</span>
									<span class="agy-provider-summary-title">Google Antigravity</span>
								</div>
								<div class="agy-provider-summary-right">
									<span class="agy-provider-summary-meta">8 models</span>
									<span class="agy-provider-badge is-enabled">Enabled</span>
								</div>
							</summary>
							<div class="agy-provider-card-body">
								<!-- Toggle: Enable provider -->
								<div class="setting-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0;">
									<div class="setting-item-info">
										<div class="setting-item-name" style="font-weight: 500;">Enable provider</div>
										<div class="setting-item-description" style="color: var(--text-muted); font-size: 11.5px;">Activate Google Antigravity for chat sessions and model selection.</div>
									</div>
									<div class="setting-item-control">
										<input type="checkbox" checked style="accent-color: var(--interactive-accent); transform: scale(1.2);">
									</div>
								</div>
								<!-- Text: CLI command -->
								<div class="setting-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px solid var(--divider-color);">
									<div class="setting-item-info">
										<div class="setting-item-name" style="font-weight: 500;">CLI command or path</div>
										<div class="setting-item-description" style="color: var(--text-muted); font-size: 11.5px;">The command or full path to the executable (e.g. "agy").</div>
									</div>
									<div class="setting-item-control">
										<input type="text" value="agy" style="background: var(--background-modifier-form-field); border: 1px solid var(--divider-color); border-radius: 4px; padding: 4px 8px; color: var(--text-normal); width: 140px;">
									</div>
								</div>
								<!-- Toggle: Run in WSL -->
								<div class="setting-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px solid var(--divider-color);">
									<div class="setting-item-info">
										<div class="setting-item-name" style="font-weight: 500;">Run in WSL</div>
										<div class="setting-item-description" style="color: var(--text-muted); font-size: 11.5px;">Execute Google Antigravity via Windows Subsystem for Linux (e.g. "wsl agy").</div>
									</div>
									<div class="setting-item-control">
										<input type="checkbox" style="accent-color: var(--interactive-accent); transform: scale(1.2);">
									</div>
								</div>
								<!-- Text: Extra CLI flags -->
								<div class="setting-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px solid var(--divider-color);">
									<div class="setting-item-info">
										<div class="setting-item-name" style="font-weight: 500;">Extra CLI flags</div>
										<div class="setting-item-description" style="color: var(--text-muted); font-size: 11.5px;">Additional flags passed to Google Antigravity on each invocation.</div>
									</div>
									<div class="setting-item-control">
										<input type="text" placeholder="--dangerously-skip-permissions" style="background: var(--background-modifier-form-field); border: 1px solid var(--divider-color); border-radius: 4px; padding: 4px 8px; color: var(--text-normal); width: 140px;">
									</div>
								</div>
								<!-- Button: Discovered models -->
								<div class="setting-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px solid var(--divider-color);">
									<div class="setting-item-info">
										<div class="setting-item-name" style="font-weight: 500;">Discovered models</div>
										<div class="setting-item-description" style="color: var(--text-muted); font-size: 11.5px;">8 models discovered and cached.</div>
									</div>
									<div class="setting-item-control">
										<button style="background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; padding: 6px 12px; font-weight: 500; cursor: pointer;">Retrieve from CLI</button>
									</div>
								</div>
							</div>
						</details>
					</div>

					<!-- Card 2: GitHub Copilot (Collapsed) -->
					<div class="setting-item agy-provider-setting-container">
						<details class="agy-provider-card">
							<summary class="agy-provider-summary">
								<div class="agy-provider-summary-left">
									<span class="agy-provider-chevron">
										<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
									</span>
									<span class="agy-provider-summary-title">GitHub Copilot</span>
								</div>
								<div class="agy-provider-summary-right">
									<span class="agy-provider-summary-meta">32 models</span>
									<span class="agy-provider-badge is-enabled">Enabled</span>
								</div>
							</summary>
						</details>
					</div>

					<!-- Card 3: Pi Coding Agent (Collapsed) -->
					<div class="setting-item agy-provider-setting-container">
						<details class="agy-provider-card">
							<summary class="agy-provider-summary">
								<div class="agy-provider-summary-left">
									<span class="agy-provider-chevron">
										<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
									</span>
									<span class="agy-provider-summary-title">Pi Coding Agent</span>
								</div>
								<div class="agy-provider-summary-right">
									<span class="agy-provider-summary-meta">28 models</span>
									<span class="agy-provider-badge is-disabled">Disabled</span>
								</div>
							</summary>
						</details>
					</div>

					<!-- Card 4: Claude Code (Collapsed) -->
					<div class="setting-item agy-provider-setting-container">
						<details class="agy-provider-card">
							<summary class="agy-provider-summary">
								<div class="agy-provider-summary-left">
									<span class="agy-provider-chevron">
										<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
									</span>
									<span class="agy-provider-summary-title">Claude Code</span>
								</div>
								<div class="agy-provider-summary-right">
									<span class="agy-provider-summary-meta">8 models</span>
									<span class="agy-provider-badge is-disabled">Disabled</span>
								</div>
							</summary>
						</details>
					</div>

					<!-- Card 5: OpenAI Codex (Collapsed) -->
					<div class="setting-item agy-provider-setting-container">
						<details class="agy-provider-card">
							<summary class="agy-provider-summary">
								<div class="agy-provider-summary-left">
									<span class="agy-provider-chevron">
										<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
									</span>
									<span class="agy-provider-summary-title">OpenAI Codex</span>
								</div>
								<div class="agy-provider-summary-right">
									<span class="agy-provider-summary-meta">3 models</span>
									<span class="agy-provider-badge is-disabled">Disabled</span>
								</div>
							</summary>
						</details>
					</div>
				</div>
			</div>
		`;
	});

	const settingsPath = path.join(screenshotsDir, '03_settings_multi_provider.png');
	const container2 = await page.$('.test-container');
	await container2.screenshot({ path: settingsPath });
	console.log(`[Visual E2E] Saved: ${settingsPath}`);

	// =========================================================================
	// Scene 4: Model & Effort Suggestion Modal
	// =========================================================================
	console.log('[Visual E2E] Capturing Scene 4: Model & Effort Suggestion Modal...');
	await page.evaluate(() => {
		document.documentElement.className = 'theme-dark';
		const root = document.getElementById('root');
		root.innerHTML = `
			<div class="test-container" style="padding: 16px; background: var(--background-secondary);">
				<!-- Suggestion Modal Box -->
				<div class="prompt" style="background: var(--background-primary); border-radius: 8px; border: 1px solid var(--divider-color); overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.4);">
					<!-- Input -->
					<div class="prompt-input-container" style="padding: 12px; border-bottom: 1px solid var(--divider-color);">
						<input type="text" class="prompt-input" value="Gemini" style="width: 100%; box-sizing: border-box; background: var(--background-modifier-form-field); border: 1px solid var(--divider-color); border-radius: 4px; padding: 8px 12px; color: var(--text-normal); font-size: 13px;" autofocus>
					</div>
					<!-- Results List -->
					<div class="suggestion-container" style="padding: 6px 0; max-height: 260px;">
						<!-- Item 1 (Selected / Active) -->
						<div class="suggestion-item is-selected" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; background: var(--background-modifier-hover); cursor: pointer;">
							<div class="suggestion-content" style="font-size: 12.5px; font-weight: 500;">
								<span>Google Antigravity - <span style="color: var(--text-accent); font-weight: 600;">Gemini</span> 3.8 Flash (Medium effort)</span>
							</div>
							<span class="agy-modal-active-badge">Active</span>
						</div>
						<!-- Item 2 -->
						<div class="suggestion-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; cursor: pointer;">
							<div class="suggestion-content" style="font-size: 12.5px;">
								<span>Google Antigravity - <span style="color: var(--text-accent); font-weight: 600;">Gemini</span> 3.8 Flash (Low effort)</span>
							</div>
						</div>
						<!-- Item 3 -->
						<div class="suggestion-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; cursor: pointer;">
							<div class="suggestion-content" style="font-size: 12.5px;">
								<span>Google Antigravity - <span style="color: var(--text-accent); font-weight: 600;">Gemini</span> 3.8 Flash (High effort)</span>
							</div>
						</div>
						<!-- Item 4 -->
						<div class="suggestion-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; cursor: pointer;">
							<div class="suggestion-content" style="font-size: 12.5px;">
								<span>Google Antigravity - <span style="color: var(--text-accent); font-weight: 600;">Gemini</span> 3.1 Pro (Low effort)</span>
							</div>
						</div>
						<!-- Item 5: From another enabled provider -->
						<div class="suggestion-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; cursor: pointer;">
							<div class="suggestion-content" style="font-size: 12.5px;">
								<span>GitHub Copilot - Claude Sonnet 4.5</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;
	});

	const modalPath = path.join(screenshotsDir, '04_model_suggest_modal.png');
	const container3 = await page.$('.test-container');
	await container3.screenshot({ path: modalPath });
	console.log(`[Visual E2E] Saved: ${modalPath}`);

	await browser.close();
	console.log('[Visual E2E] Screenshot testing completed successfully!');
}

runScreenshotTests().catch(err => {
	console.error('[Visual E2E] Error running screenshot tests:', err);
	process.exit(1);
});
