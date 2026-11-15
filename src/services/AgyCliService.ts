import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { App } from 'obsidian';
import {
	AiChatPluginSettings,
	CliStreamCallbacks,
	ModelDefinition,
	ModelDiscoveryResult,
	AiProviderId,
	ProviderConfig,
	ANTIGRAVITY_MODELS,
	PI_DEFAULT_MODELS,
	COPILOT_DEFAULT_MODELS,
	CLAUDE_DEFAULT_MODELS,
	CODEX_DEFAULT_MODELS,
	DEFAULT_PROVIDER_CONFIGS,
	PROVIDER_METADATA
} from '../types';

export interface HistoryTurn {
	role: 'user' | 'assistant';
	content: string;
	attachedNotePath?: string;
	attachedSelection?: string;
	attachedContextPath?: string;
	attachedContextScope?: 'file' | 'folder';
}

export interface HistoryFormatOptions {
	maxHistoryTurns?: number;
	maxHistoryChars?: number;
}

export interface SendPromptOptions {
	attachedFiles?: string[];
}

export function formatPromptWithHistory(
	currentPrompt: string,
	history: HistoryTurn[],
	options?: HistoryFormatOptions
): string {
	const maxTurns = options?.maxHistoryTurns ?? 6;
	const maxChars = options?.maxHistoryChars ?? 16000;

	// Filter out empty or whitespace-only messages
	const validTurns = history.filter(turn => turn.content && turn.content.trim().length > 0);
	if (validTurns.length === 0) {
		return currentPrompt;
	}

	// Slice the most recent turns up to maxTurns
	const recentTurns = validTurns.slice(-maxTurns);

	// Format each turn
	const formattedTurns: string[] = [];
	for (const turn of recentTurns) {
		if (turn.role === 'user') {
			let userBody = turn.content.trim();
			let prefixes = '';
			if (turn.attachedContextPath && !userBody.includes(turn.attachedContextPath)) {
				prefixes += `Here is the context: "${turn.attachedContextPath}":\n\n`;
			}
			if (turn.attachedNotePath && !userBody.includes(turn.attachedNotePath)) {
				if (turn.attachedSelection) {
					prefixes += `Regarding the selected text in file "${turn.attachedNotePath}":\n"""\n${turn.attachedSelection}\n"""\n\n`;
				} else {
					prefixes += `The context: "${turn.attachedNotePath}":\n\n`;
				}
			}
			formattedTurns.push(`User:\n${prefixes}${userBody}`);
		} else {
			formattedTurns.push(`Assistant:\n${turn.content.trim()}`);
		}
	}

	// Work backwards from latest turn to ensure total length does not exceed maxChars
	const selectedTurns: string[] = [];
	let currentLength = 0;

	for (let i = formattedTurns.length - 1; i >= 0; i--) {
		let turnText = formattedTurns[i];
		// If a single turn itself is larger than maxChars, truncate it
		if (turnText.length > maxChars) {
			turnText = turnText.slice(0, maxChars - 80) + '\n\n[... content truncated for length ...]';
		}

		if (currentLength + turnText.length + 2 > maxChars && selectedTurns.length > 0) {
			break;
		}

		selectedTurns.unshift(turnText);
		currentLength += turnText.length + 2;
	}

	if (selectedTurns.length === 0) {
		return currentPrompt;
	}

	const historyBlock = selectedTurns.join('\n\n');

	return `Previous conversation history:

${historyBlock}

---

Current request:
${currentPrompt}`;
}

export class AgyCliService {
	private activeProcess: ChildProcess | null = null;

	constructor(
		private app: App,
		private getSettings: () => AiChatPluginSettings,
		private saveSettings: (settings: AiChatPluginSettings) => Promise<void>,
		private spawner: typeof spawn = spawn
	) {}

	public getActiveProviderConfig(): ProviderConfig {
		const settings = this.getSettings();
		const providerId = settings.activeProvider || 'antigravity';
		if (!settings.providers || !settings.providers[providerId]) {
			return DEFAULT_PROVIDER_CONFIGS[providerId] || DEFAULT_PROVIDER_CONFIGS.antigravity;
		}
		return settings.providers[providerId];
	}

	public getConversationId(): string | null {
		const config = this.getActiveProviderConfig();
		return config.conversationId || null;
	}

	public setConversationId(id: string | null): void {
		const settings = this.getSettings();
		const providerId = settings.activeProvider || 'antigravity';
		if (settings.providers && settings.providers[providerId]) {
			settings.providers[providerId].conversationId = id;
			void this.saveSettings(settings);
		}
	}

	public isRunning(): boolean {
		return this.activeProcess !== null && !this.activeProcess.killed;
	}

	public abort(): void {
		if (this.activeProcess && !this.activeProcess.killed) {
			try {
				this.activeProcess.kill('SIGINT');
				window.setTimeout(() => {
					if (this.activeProcess && !this.activeProcess.killed) {
						this.activeProcess.kill('SIGTERM');
					}
				}, 400);
			} catch (e) {
				console.error('[Sidecar AI] Error killing process:', e);
			}
		}
		this.activeProcess = null;
	}

	public resetSession(): void {
		this.abort();
		this.setConversationId(null);
	}

	private getVaultBasePath(): string {
		const adapter = this.app.vault.adapter as { getBasePath?: () => string } | undefined;
		if (adapter && typeof adapter.getBasePath === 'function') {
			return adapter.getBasePath();
		}
		return typeof process !== 'undefined' && process.cwd ? process.cwd() : '';
	}

	public toWslPath(winPath: string): string {
		const match = winPath.match(/^([a-zA-Z]):[\\/](.*)$/);
		if (match) {
			const drive = match[1].toLowerCase();
			const rest = match[2].replace(/\\/g, '/');
			return `/mnt/${drive}/${rest}`;
		}
		return winPath.replace(/\\/g, '/');
	}

	public static sanitizeCliCommand(rawCmd: string, defaultCmd: string): string {
		const trimmed = (rawCmd || defaultCmd).trim();
		// Disallow dangerous shell metacharacters that could enable command chaining
		if (/[;&|`$<>]/.test(trimmed)) {
			console.warn(`[Sidecar AI] Dangerous shell metacharacters detected in CLI command: "${trimmed}". Falling back to default.`);
			return defaultCmd;
		}
		return trimmed;
	}

	public static buildCustomCliArgs(template: string | undefined, prompt: string): string[] {
		const rawTemplate = template?.trim() || 'tell {prompt}';
		const args: string[] = [];

		if (rawTemplate.includes('{prompt}')) {
			const parts = rawTemplate.split(/\s+/);
			for (const part of parts) {
				if (part === '{prompt}') {
					args.push(prompt);
				} else if (part.includes('{prompt}')) {
					args.push(part.replace('{prompt}', prompt));
				} else {
					args.push(part);
				}
			}
		} else {
			if (rawTemplate.length > 0) {
				args.push(...rawTemplate.split(/\s+/));
			}
			args.push(prompt);
		}

		return args;
	}

	public static getSpawnEnvironment(): NodeJS.ProcessEnv {
		const env: NodeJS.ProcessEnv = {
			...process.env,
			PAGER: 'cat',
			CI: '1',
		};
		// On macOS/Linux GUI apps (like Obsidian launched via Finder/Dock), PATH often lacks Homebrew and user binaries.
		// Prepend standard binary paths so node, pi, agy, copilot can be located by /usr/bin/env shebangs.
		if (process.platform === 'darwin' || process.platform === 'linux') {
			const home = process.env.HOME || '';
			const extraPaths = [
				home ? path.posix.join(home, '.pi', 'agent', 'bin') : '',
				home ? path.posix.join(home, '.local', 'bin') : '',
				home ? path.posix.join(home, '.cargo', 'bin') : '',
				'/opt/homebrew/bin',
				'/opt/homebrew/sbin',
				'/usr/local/bin',
				'/usr/local/sbin',
				'/usr/bin',
				'/bin',
				'/usr/sbin',
				'/sbin'
			].filter(Boolean);
			const currentPath = env.PATH || env.Path || '';
			const currentSegments = currentPath.split(':').filter(Boolean);
			for (const p of extraPaths) {
				if (!currentSegments.includes(p)) {
					currentSegments.push(p);
				}
			}
			env.PATH = currentSegments.join(':');
		} else if (process.platform === 'win32') {
			// On Windows Electron apps, PATH often lacks user-installed CLI paths when launched from Desktop or Start Menu
			// (e.g. Pi agent non-npm install in ~/.pi/agent/bin, Antigravity in LocalAppData, etc.)
			const userProfile = process.env.USERPROFILE || '';
			const localAppData = process.env.LOCALAPPDATA || '';
			const appData = process.env.APPDATA || '';

			const winExtraPaths = [
				userProfile ? path.win32.join(userProfile, '.pi', 'agent', 'bin') : '',
				userProfile ? path.win32.join(userProfile, '.local', 'bin') : '',
				localAppData ? path.win32.join(localAppData, 'agy', 'bin') : '',
				localAppData ? path.win32.join(localAppData, 'Programs', 'Antigravity', 'bin') : '',
				localAppData ? path.win32.join(localAppData, 'Programs', 'Antigravity IDE', 'bin') : '',
				localAppData ? path.win32.join(localAppData, 'Programs', 'experienced-llms', 'bin') : '',
				localAppData ? path.win32.join(localAppData, 'Microsoft', 'WinGet', 'Links') : '',
				userProfile ? path.win32.join(userProfile, '.cargo', 'bin') : '',
				appData ? path.win32.join(appData, 'npm') : ''
			].filter(Boolean);

			const currentPath = env.PATH || env.Path || '';
			const currentSegments = currentPath.split(';').filter(Boolean);
			for (const p of winExtraPaths) {
				if (!currentSegments.some(s => s.toLowerCase() === p.toLowerCase())) {
					currentSegments.unshift(p);
				}
			}
			env.PATH = currentSegments.join(';');
		}
		return env;
	}

	private resolveExecution(
		config: ProviderConfig,
		targetProvider: AiProviderId,
		vaultPath?: string
	): { command: string; prefixArgs: string[] } {
		const defaultCmd = PROVIDER_METADATA[targetProvider]?.defaultCmd || 'agy';
		const rawCmd = AgyCliService.sanitizeCliCommand(config.cliCommand, defaultCmd);

		if (config.useWsl) {
			const prefixArgs = ['-d', 'Ubuntu'];
			if (vaultPath) {
				prefixArgs.push('--cd', this.toWslPath(vaultPath));
			}
			prefixArgs.push('--', rawCmd);
			return { command: 'wsl', prefixArgs };
		}

		if (process.platform === 'win32') {
			let resolvedCmd = rawCmd;
			const userProfile = process.env.USERPROFILE || '';
			const appData = process.env.APPDATA || '';

			// Pi Agent standalone updater installs into ~/.pi/agent/bin/pi.cmd instead of global npm
			if (targetProvider === 'pi' && (rawCmd.toLowerCase() === 'pi' || rawCmd.toLowerCase() === 'pi.cmd')) {
				const piCmdCandidate = userProfile ? path.win32.join(userProfile, '.pi', 'agent', 'bin', 'pi.cmd') : '';
				if (piCmdCandidate && fs.existsSync(piCmdCandidate)) {
					resolvedCmd = piCmdCandidate;
				}
			}

			// Claude CLI native install into ~/.local/bin/claude.exe or npm %APPDATA%\npm\claude.cmd
			if (targetProvider === 'claude' && (rawCmd.toLowerCase() === 'claude' || rawCmd.toLowerCase() === 'claude.exe' || rawCmd.toLowerCase() === 'claude.cmd')) {
				const claudeNativeCandidate = userProfile ? path.win32.join(userProfile, '.local', 'bin', 'claude.exe') : '';
				const claudeNpmCandidate = appData ? path.win32.join(appData, 'npm', 'claude.cmd') : '';
				if (claudeNativeCandidate && fs.existsSync(claudeNativeCandidate)) {
					resolvedCmd = claudeNativeCandidate;
				} else if (claudeNpmCandidate && fs.existsSync(claudeNpmCandidate)) {
					resolvedCmd = claudeNpmCandidate;
				}
			}

			// Codex CLI npm global install into %APPDATA%\npm\codex.cmd
			if (targetProvider === 'codex' && (rawCmd.toLowerCase() === 'codex' || rawCmd.toLowerCase() === 'codex.cmd')) {
				const codexCandidate = appData ? path.win32.join(appData, 'npm', 'codex.cmd') : '';
				if (codexCandidate && fs.existsSync(codexCandidate)) {
					resolvedCmd = codexCandidate;
				}
			}

			if (
				targetProvider === 'pi' ||
				targetProvider === 'codex' ||
				targetProvider === 'custom' ||
				rawCmd.toLowerCase() === 'pi' ||
				rawCmd.toLowerCase() === 'codex' ||
				resolvedCmd.toLowerCase().endsWith('.cmd') ||
				resolvedCmd.toLowerCase().endsWith('.bat')
			) {
				return { command: 'cmd.exe', prefixArgs: ['/c', resolvedCmd] };
			}
			if (!resolvedCmd.toLowerCase().endsWith('.exe') && !resolvedCmd.includes('\\') && !resolvedCmd.includes('/')) {
				return { command: `${resolvedCmd}.exe`, prefixArgs: [] };
			}
			return { command: resolvedCmd, prefixArgs: [] };
		}

		// On Unix/Linux/macOS, check standalone binary paths
		const home = process.env.HOME || '';
		if (targetProvider === 'pi' && rawCmd === 'pi') {
			const piCandidate = home ? path.posix.join(home, '.pi', 'agent', 'bin', 'pi') : '';
			if (piCandidate && fs.existsSync(piCandidate)) {
				return { command: piCandidate, prefixArgs: [] };
			}
		}
		if (targetProvider === 'claude' && rawCmd === 'claude') {
			const claudeCandidate = home ? path.posix.join(home, '.local', 'bin', 'claude') : '';
			if (claudeCandidate && fs.existsSync(claudeCandidate)) {
				return { command: claudeCandidate, prefixArgs: [] };
			}
		}

		return { command: rawCmd, prefixArgs: [] };
	}

	public async checkCliInstalled(providerId?: AiProviderId): Promise<boolean> {
		const settings = this.getSettings();
		const targetProvider = providerId || settings.activeProvider || 'antigravity';
		const config = (settings.providers && settings.providers[targetProvider]) || DEFAULT_PROVIDER_CONFIGS[targetProvider];

		return new Promise((resolve) => {
			const { command, prefixArgs } = this.resolveExecution(config, targetProvider);
			const args = [...prefixArgs, '--version'];

			try {
				const child = this.spawner(command, args, {
					env: AgyCliService.getSpawnEnvironment(),
					shell: false,
					timeout: 5000,
					stdio: ['ignore', 'pipe', 'pipe']
				});
				child.on('error', () => resolve(false));
				child.on('close', (code) => resolve(code === 0));
			} catch {
				resolve(false);
			}
		});
	}

	public getModelDiscoveryArgs(targetProvider: AiProviderId): string[] {
		if (targetProvider === 'copilot') {
			return ['help', 'config'];
		}
		if (targetProvider === 'pi') {
			return ['--list-models'];
		}
		if (targetProvider === 'claude' || targetProvider === 'codex' || targetProvider === 'custom') {
			return [];
		}
		return ['models'];
	}

	public async checkAuthStatus(providerId?: AiProviderId): Promise<{ loggedIn: boolean; error?: string }> {
		const settings = this.getSettings();
		const targetProvider = providerId || settings.activeProvider || 'antigravity';
		const config = (settings.providers && settings.providers[targetProvider]) || DEFAULT_PROVIDER_CONFIGS[targetProvider];

		if (targetProvider === 'custom') {
			return { loggedIn: true };
		}

		if (targetProvider === 'claude') {
			try {
				const { command, prefixArgs } = this.resolveExecution(config, 'claude');
				const authChild = this.spawner(command, [...prefixArgs, 'auth', 'status'], {
					env: AgyCliService.getSpawnEnvironment(),
					shell: false,
					timeout: 5000,
					stdio: ['ignore', 'pipe', 'pipe']
				});
				let authStdout = '';
				authChild.stdout?.on('data', (d: Buffer) => {
					authStdout += d.toString();
				});
				await new Promise<void>((r) => {
					authChild.on('close', () => r());
					authChild.on('error', () => r());
				});
				if (authStdout.trim()) {
					try {
						const statusObj = JSON.parse(authStdout) as { loggedIn?: boolean; authMethod?: string };
						if (statusObj.loggedIn === false) {
							return {
								loggedIn: false,
								error: 'Claude Code CLI is installed, but not signed in. Run "claude auth login" in your terminal to sign in.'
							};
						}
					} catch {
						// Ignore JSON parse error
					}
				}
				return { loggedIn: true };
			} catch {
				return { loggedIn: true };
			}
		}

		if (targetProvider === 'codex') {
			try {
				const { command, prefixArgs } = this.resolveExecution(config, 'codex');
				const authChild = this.spawner(command, [...prefixArgs, 'login', 'status'], {
					env: AgyCliService.getSpawnEnvironment(),
					shell: false,
					timeout: 5000,
					stdio: ['ignore', 'pipe', 'pipe']
				});
				let authOut = '';
				authChild.stdout?.on('data', (d: Buffer) => { authOut += d.toString(); });
				authChild.stderr?.on('data', (d: Buffer) => { authOut += d.toString(); });
				const exitCode = await new Promise<number | null>((r) => {
					authChild.on('close', (code) => r(code));
					authChild.on('error', () => r(null));
				});
				const lower = authOut.toLowerCase();
				if (
					(exitCode !== null && exitCode !== 0) ||
					lower.includes('not logged in') ||
					lower.includes('logged out') ||
					lower.includes('not authenticated')
				) {
					return {
						loggedIn: false,
						error: 'OpenAI Codex CLI is installed, but not signed in. Run "codex login" in your terminal to sign in.'
					};
				}
				return { loggedIn: true };
			} catch {
				return { loggedIn: true };
			}
		}

		if (targetProvider === 'copilot') {
			try {
				const env = AgyCliService.getSpawnEnvironment();
				if (env.COPILOT_GITHUB_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN) {
					return { loggedIn: true };
				}

				let ghAuthFailed = false;
				try {
					const ghCmd = process.platform === 'win32' ? 'gh.exe' : 'gh';
					const ghChild = this.spawner(ghCmd, ['auth', 'status'], {
						env,
						shell: false,
						timeout: 5000,
						stdio: ['ignore', 'pipe', 'pipe']
					});
					let ghOut = '';
					ghChild.stdout?.on('data', (d: Buffer) => { ghOut += d.toString(); });
					ghChild.stderr?.on('data', (d: Buffer) => { ghOut += d.toString(); });
					const ghCode = await new Promise<number | null>((r) => {
						ghChild.on('close', (code) => r(code));
						ghChild.on('error', () => r(null));
					});
					if (ghCode === 0 && (ghOut.toLowerCase().includes('logged in') || ghOut.toLowerCase().includes('active account: true'))) {
						return { loggedIn: true };
					}
					if (ghCode !== null && ghCode !== 0 && ghOut.toLowerCase().includes('not logged in')) {
						ghAuthFailed = true;
					}
				} catch {
					// gh binary not present, proceed
				}

				const home = process.platform === 'win32' ? (process.env.USERPROFILE || '') : (process.env.HOME || '');
				const copilotDir = home ? path.join(home, '.copilot') : '';
				const hasCopilotConfig = copilotDir && fs.existsSync(copilotDir) && (
					fs.existsSync(path.join(copilotDir, 'config.json')) ||
					fs.existsSync(path.join(copilotDir, 'session-store.db')) ||
					fs.existsSync(path.join(copilotDir, 'settings.json'))
				);

				if (!hasCopilotConfig && ghAuthFailed) {
					return {
						loggedIn: false,
						error: 'GitHub Copilot CLI is installed, but not signed in. Run "copilot login" in your terminal to authenticate.'
					};
				}

				return { loggedIn: true };
			} catch {
				return { loggedIn: true };
			}
		}

		if (targetProvider === 'antigravity') {
			try {
				const home = process.platform === 'win32' ? (process.env.USERPROFILE || '') : (process.env.HOME || '');
				const oauthPath = home ? path.join(home, '.gemini', 'oauth_creds.json') : '';
				const googleAccountsPath = home ? path.join(home, '.gemini', 'google_accounts.json') : '';
				const hasCredsFile = (oauthPath && fs.existsSync(oauthPath)) || (googleAccountsPath && fs.existsSync(googleAccountsPath));

				if (hasCredsFile) {
					return { loggedIn: true };
				}

				const { command, prefixArgs } = this.resolveExecution(config, 'antigravity');
				const child = this.spawner(command, [...prefixArgs, 'models'], {
					env: AgyCliService.getSpawnEnvironment(),
					shell: false,
					timeout: 7000,
					stdio: ['ignore', 'pipe', 'pipe']
				});
				let out = '';
				child.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
				child.stderr?.on('data', (d: Buffer) => { out += d.toString(); });
				const exitCode = await new Promise<number | null>((r) => {
					child.on('close', (code) => r(code));
					child.on('error', () => r(null));
				});
				const lower = out.toLowerCase();
				if (
					(exitCode !== null && exitCode !== 0) ||
					lower.includes('not authenticated') ||
					lower.includes('401') ||
					lower.includes('please sign in') ||
					lower.includes('authentication failed')
				) {
					return {
						loggedIn: false,
						error: 'Google Antigravity CLI is installed, but not signed in. Run "agy" in your terminal to authenticate.'
					};
				}
				return { loggedIn: true };
			} catch {
				return { loggedIn: true };
			}
		}

		return { loggedIn: true };
	}

	public async fetchAvailableModels(providerId?: AiProviderId): Promise<ModelDiscoveryResult> {
		const settings = this.getSettings();
		const targetProvider = providerId || settings.activeProvider || 'antigravity';
		const config = (settings.providers && settings.providers[targetProvider]) || DEFAULT_PROVIDER_CONFIGS[targetProvider];

		if (targetProvider === 'custom') {
			return {
				success: true,
				models: [],
				isFallback: false
			};
		}
		if (targetProvider === 'claude') {
			const auth = await this.checkAuthStatus('claude');
			return {
				success: true,
				models: CLAUDE_DEFAULT_MODELS,
				isFallback: !auth.loggedIn,
				error: auth.error
			};
		}
		if (targetProvider === 'codex') {
			let models: ModelDefinition[] = [];
			try {
				const home = process.platform === 'win32' ? (process.env.USERPROFILE || '') : (process.env.HOME || '');
				const cachePath = home ? path.join(home, '.codex', 'models_cache.json') : '';
				if (cachePath && fs.existsSync(cachePath)) {
					const cacheRaw = fs.readFileSync(cachePath, 'utf8');
					interface RawCodexCacheModel {
						slug: string;
						display_name?: string;
						visibility?: string;
						supported_in_api?: boolean;
						default_reasoning_level?: string;
						supported_reasoning_levels?: Array<{ effort?: string }>;
					}
					interface RawCodexCache {
						models?: RawCodexCacheModel[];
					}
					const cacheData = JSON.parse(cacheRaw) as RawCodexCache;
					if (Array.isArray(cacheData?.models)) {
						const visible = cacheData.models.filter(m =>
							m.visibility !== 'hide' && m.supported_in_api !== false
						);
						models = visible.map(m => {
							const efforts: string[] = Array.isArray(m.supported_reasoning_levels)
								? m.supported_reasoning_levels.map((r) => {
									const eff = String(r.effort || '');
									return eff.charAt(0).toUpperCase() + eff.slice(1);
								})
								: [];
							const defaultEffortRaw = m.default_reasoning_level ? String(m.default_reasoning_level) : '';
							const defaultEffort = defaultEffortRaw
								? defaultEffortRaw.charAt(0).toUpperCase() + defaultEffortRaw.slice(1)
								: (efforts[0] || undefined);
							return {
								id: m.slug,
								label: m.display_name || m.slug,
								efforts,
								defaultEffort
							};
						});
					}
				}
			} catch (e) {
				console.warn('[Sidecar AI] Error reading Codex models_cache.json:', e);
			}

			if (models.length === 0) {
				models = [...CODEX_DEFAULT_MODELS];
			}

			try {
				const home = process.platform === 'win32' ? (process.env.USERPROFILE || '') : (process.env.HOME || '');
				const configPath = home ? path.join(home, '.codex', 'config.toml') : '';
				if (configPath && fs.existsSync(configPath)) {
					const content = fs.readFileSync(configPath, 'utf8');
					const modelMatch = content.match(/^\s*model\s*=\s*"([^"]+)"/m);
					if (modelMatch && modelMatch[1]) {
						const configuredModel = modelMatch[1].trim();
						const existingIdx = models.findIndex(m => m.id === configuredModel);
						if (existingIdx > 0) {
							const [found] = models.splice(existingIdx, 1);
							models.unshift(found);
						} else if (existingIdx === -1) {
							models.unshift({
								id: configuredModel,
								label: `${configuredModel} (Configured)`,
								efforts: ['Low', 'Medium', 'High'],
								defaultEffort: 'Low'
							});
						}
					}
				}
			} catch {
				// Ignore config file reading error
			}
			const auth = await this.checkAuthStatus('codex');
			return {
				success: true,
				models,
				isFallback: !auth.loggedIn,
				error: auth.error
			};
		}
		const defaultModelsForProvider = targetProvider === 'antigravity'
			? ANTIGRAVITY_MODELS
			: (targetProvider === 'pi'
				? PI_DEFAULT_MODELS
				: (targetProvider === 'copilot' ? COPILOT_DEFAULT_MODELS : []));

		const fallbackModels = config.cachedModels && config.cachedModels.length > 0
			? config.cachedModels
			: defaultModelsForProvider;

		const queryArgs = this.getModelDiscoveryArgs(targetProvider);

		const { command, prefixArgs } = this.resolveExecution(config, targetProvider);
		const args = [...prefixArgs, ...queryArgs];

		return new Promise((resolve) => {
			let output = '';
			let stderrOutput = '';

			try {
				const child = this.spawner(command, args, {
					env: AgyCliService.getSpawnEnvironment(),
					shell: false,
					timeout: 10000,
					stdio: ['ignore', 'pipe', 'pipe']
				});

				child.stdout?.on('data', (data: Buffer | string) => {
					output += data.toString();
				});

				child.stderr?.on('data', (data: Buffer | string) => {
					stderrOutput += data.toString();
				});

				child.on('error', (err: Error) => {
					console.warn(`[Sidecar AI] Could not query ${targetProvider} CLI:`, err);
					resolve({
						success: false,
						models: fallbackModels,
						isFallback: true,
						error: `Failed to execute "${command}": ${err.message}. Check your CLI path and PATH environment variable.`
					});
				});

				child.on('close', (code) => {
					void (async () => {
						if (code === 0 && output.trim()) {
							let parsed: ModelDefinition[] = [];
							if (targetProvider === 'copilot') {
								parsed = this.parseCopilotModels(output);
							} else if (targetProvider === 'pi') {
								parsed = this.parsePiModels(output);
							} else {
								parsed = this.parseAntigravityModels(output);
							}

							if (parsed.length > 0) {
								if (settings.providers && settings.providers[targetProvider]) {
									const targetConf = settings.providers[targetProvider];
									targetConf.cachedModels = parsed;

									// Validate selectedModel against newly discovered models
									const modelExists = targetConf.selectedModel && parsed.some(m => m.id === targetConf.selectedModel);
									if (!modelExists) {
										targetConf.selectedModel = parsed[0].id;
										if (!targetConf.modelEfforts) {
											targetConf.modelEfforts = {};
										}
										if (parsed[0].defaultEffort) {
											targetConf.modelEfforts[parsed[0].id] = parsed[0].defaultEffort;
										}
									}

									await this.saveSettings(settings);
								}
								resolve({
									success: true,
									models: parsed,
									isFallback: false
								});
								return;
							}
						}

						const errDetail = stderrOutput.trim() || `CLI exited with code ${code}`;
						console.warn(`[Sidecar AI] Model discovery non-zero or empty for ${targetProvider}: ${errDetail}`);
						resolve({
							success: false,
							models: fallbackModels,
							isFallback: true,
							error: errDetail
						});
					})();
				});
			} catch (err: unknown) {
				const errMsg = err instanceof Error ? err.message : String(err);
				resolve({
					success: false,
					models: fallbackModels,
					isFallback: true,
					error: errMsg
				});
			}
		});
	}

	private parseCopilotModels(rawOutput: string): ModelDefinition[] {
		const models: ModelDefinition[] = [];

		// If the output contains an 'Unavailable models' section (e.g. from copilot /model output),
		// strip it out so unavailable plan models are never parsed as selectable choices!
		const accessibleOutput = rawOutput.split(/unavailable\s+models/i)[0];

		// 1. `copilot help config` lists models as `- "id"` bullets under the `model` setting
		const configMatch = accessibleOutput.match(/^\s*`model`:[^\n]*(?:\n(?![ \t]*-|[ \t]*`)[^\n]*)*\n((?:[ \t]*-[ \t]*"[^"\n]+"[ \t]*\r?\n?)+)/m);
		if (configMatch && configMatch[1]) {
			for (const line of configMatch[1].split(/\r?\n/)) {
				const id = line.match(/-\s*"([^"]+)"/)?.[1]?.trim();
				if (id && !models.some(m => m.id === id)) {
					const label = id.toLowerCase() === 'auto'
						? 'Copilot Fusion (Auto - Recommended)'
						: `${id} (Paid plan)`;
					models.push({ id, label, efforts: [] });
				}
			}
		}

		// 2. Legacy `copilot --help` format: --model <model> ... (choices: ...) or (allowed values: ...)
		if (models.length === 0) {
			const modelMatch = accessibleOutput.match(/--model\s+<model>[\s\S]*?\((?:choices|allowed values):\s*([^)]+)\)/i);
			if (modelMatch && modelMatch[1]) {
				const items = modelMatch[1].split(/,\s*/);
				for (const item of items) {
					const cleaned = item.replace(/['"]/g, '').trim();
					if (cleaned && !models.some(m => m.id === cleaned)) {
						const label = cleaned.toLowerCase() === 'auto'
							? 'Copilot Fusion (Auto - Recommended)'
							: `${cleaned} (Paid plan)`;
						models.push({
							id: cleaned,
							label,
							efforts: []
						});
					}
				}
			}
		}

		if (models.length > 0) {
			// Always ensure 'auto' (Copilot Fusion) is included and placed at the top for Copilot
			if (!models.some(m => m.id === 'auto')) {
				models.unshift({
					id: 'auto',
					label: 'Copilot Fusion (Auto - Recommended)',
					efforts: []
				});
			}
			return models;
		}

		// If CLI output has no enumerated model choices (e.g. Copilot CLI 1.0.105+),
		// return the standard default catalog with Copilot Fusion
		return [...COPILOT_DEFAULT_MODELS];
	}

	private parseAntigravityModels(rawOutput: string): ModelDefinition[] {
		const lines = rawOutput.split('\n');
		const grouped = new Map<string, { label: string; efforts: string[]; map: Record<string, string> }>();

		for (const rawLine of lines) {
			const line = rawLine.trim();
			if (!line || line.startsWith('Available') || line.startsWith('---') || line.startsWith('ID')) {
				continue;
			}

			const parts = line.split(/\s{2,}|\t/);
			const id = parts[0]?.trim();
			const label = parts[1]?.trim() || id;

			if (!id) continue;

			const effortMatch = id.match(/^(.*?)-(low|medium|high|max)$/i);
			if (effortMatch) {
				const baseId = effortMatch[1];
				const effortRaw = effortMatch[2].toLowerCase();
				const effortTitle = effortRaw.charAt(0).toUpperCase() + effortRaw.slice(1);

				if (!grouped.has(baseId)) {
					const baseLabel = label.replace(/\s*\((low|medium|high|max)\)/i, '').trim();
					grouped.set(baseId, { label: baseLabel, efforts: [], map: {} });
				}
				const item = grouped.get(baseId)!;
				if (!item.efforts.includes(effortTitle)) {
					item.efforts.push(effortTitle);
					item.map[effortRaw] = id;
				}
			} else {
				if (!grouped.has(id)) {
					grouped.set(id, { label, efforts: [], map: {} });
				}
			}
		}

		const result: ModelDefinition[] = [];
		for (const [id, data] of grouped.entries()) {
			result.push({
				id,
				label: data.label,
				efforts: data.efforts,
				defaultEffort: data.efforts.includes('Medium') ? 'Medium' : (data.efforts[0] || undefined),
				effortModelMap: Object.keys(data.map).length > 0 ? data.map : undefined
			});
		}

		return result.length > 0 ? result : ANTIGRAVITY_MODELS;
	}

	private parsePiModels(rawOutput: string): ModelDefinition[] {
		const lines = rawOutput.split('\n');
		const models: ModelDefinition[] = [];

		for (const rawLine of lines) {
			const line = rawLine.trim();
			if (!line || line.toLowerCase().startsWith('provider') || line.startsWith('---') || line.startsWith('ID')) {
				continue;
			}

			const parts = line.split(/\s+/);
			if (parts.length < 2) continue;

			const provider = parts[0];
			const model = parts[1];
			// Preserve unambiguous combined identifier <provider>/<model> (e.g. github-copilot/claude-haiku-4.5)
			const scopedId = `${provider}/${model}`;
			const isThinking = parts.length >= 5 && parts[4].toLowerCase() === 'yes';

			const providerFormatted = provider.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
			const cleanModel = model
				.split('-')
				.map(w => w.charAt(0).toUpperCase() + w.slice(1))
				.join(' ');

			const label = `${cleanModel} (${providerFormatted})`;
			// Pi supports off, low, medium, high when model supports thinking
			const efforts = isThinking ? ['Off', 'Low', 'Medium', 'High'] : [];

			models.push({
				id: scopedId,
				label,
				efforts,
				defaultEffort: isThinking ? 'High' : undefined
			});
		}

		return models.length > 0 ? models : PI_DEFAULT_MODELS;
	}

	public buildPromptArgs(
		providerId: AiProviderId,
		config: ProviderConfig,
		prompt: string,
		options?: SendPromptOptions
	): string[] {
		const args: string[] = [];

		if (providerId === 'custom') {
			args.push(...AgyCliService.buildCustomCliArgs(config.promptTemplate, prompt));
		} else if (providerId === 'pi') {
			// Pi Coding Agent uses -p (print/non-interactive mode) and reads the prompt from stdin.
			// Passing prompt via stdin avoids Windows cmd.exe argument newline truncation and the 8191-char limit.
			args.push('-p');

			if (config.selectedModel) {
				args.push('--model', config.selectedModel);
			}

			const selectedEffort = (config.modelEfforts?.[config.selectedModel] || 'high').toLowerCase();
			if (selectedEffort && selectedEffort !== 'off') {
				args.push('--thinking', selectedEffort);
			} else if (selectedEffort === 'off') {
				args.push('--thinking', 'off');
			}

			// If files are attached, pass them as @file arguments so models (even small local LLMs) read the note content
			const validFiles = (options?.attachedFiles || []).filter(f => f && fs.existsSync(f));
			if (validFiles.length > 0) {
				const formattedFiles = validFiles.map(f => `@${config.useWsl ? this.toWslPath(f) : f}`);
				args.push('--', ...formattedFiles);
			}
		} else if (providerId === 'claude') {
			// Path A: Standalone execution; multi-turn history is provided by Obsidian via formatPromptWithHistory.
			args.push('-p');
			args.push('--output-format', 'text');
			args.push('--dangerously-skip-permissions');

			if (config.selectedModel) {
				args.push('--model', config.selectedModel);
			}

			const selectedEffort = config.modelEfforts?.[config.selectedModel];
			if (selectedEffort) {
				args.push('--effort', selectedEffort.toLowerCase());
			}

			const validFiles = (options?.attachedFiles || []).filter(f => f && fs.existsSync(f));
			const addedDirs = new Set<string>();
			for (const f of validFiles) {
				try {
					const dir = fs.statSync(f).isDirectory() ? f : path.dirname(f);
					if (!addedDirs.has(dir)) {
						addedDirs.add(dir);
						args.push('--add-dir', config.useWsl ? this.toWslPath(dir) : dir);
					}
				} catch {
					// ignore filesystem errors
				}
			}
		} else if (providerId === 'codex') {
			// Path A: Standalone execution; multi-turn history is provided by Obsidian via formatPromptWithHistory.
			args.push('exec');
			args.push('--color', 'never');
			const validFiles = (options?.attachedFiles || []).filter(f => f && fs.existsSync(f));
			const addedDirs = new Set<string>();
			for (const f of validFiles) {
				try {
					const dir = fs.statSync(f).isDirectory() ? f : path.dirname(f);
					if (!addedDirs.has(dir)) {
						addedDirs.add(dir);
						args.push('--add-dir', config.useWsl ? this.toWslPath(dir) : dir);
					}
				} catch {
					// ignore filesystem errors
				}
			}

			args.push('--skip-git-repo-check');
			args.push('--json');

			if (config.selectedModel) {
				args.push('-m', config.selectedModel);
			}

			const selectedEffort = config.modelEfforts?.[config.selectedModel];
			if (selectedEffort) {
				args.push('-c', `model_reasoning_effort="${selectedEffort.toLowerCase()}"`);
			}

			// Pass '-' so codex reads instructions from stdin, avoiding Windows cmd.exe newline command truncation
			args.push('-');
		} else {
			// Standard providers (Copilot, Antigravity) use -p <prompt>
			// Path A: Standalone execution; multi-turn history is provided by Obsidian via formatPromptWithHistory.
			args.push('-p', prompt);

			if (providerId === 'copilot') {
				// Copilot CLI flags
				args.push('-s'); // Silent mode (only response)
				args.push('--allow-all-tools'); // Allow tools non-interactively
				args.push('--output-format', 'text');

				if (config.selectedModel && config.selectedModel !== 'auto') {
					args.push('--model', config.selectedModel);
				} else {
					args.push('--model', 'auto');
				}
			} else {
				// Antigravity CLI flags
				args.push('--output-format', 'text');
				args.push('--dangerously-skip-permissions');

				if (config.selectedModel) {
					const models = config.cachedModels && config.cachedModels.length > 0 ? config.cachedModels : ANTIGRAVITY_MODELS;
					const modelDef = models.find(m => m.id === config.selectedModel);
					const selectedEffort = (config.modelEfforts?.[config.selectedModel] || modelDef?.defaultEffort || 'Medium').toLowerCase();

					let exactCliModelId = config.selectedModel;
					if (modelDef && modelDef.effortModelMap && modelDef.effortModelMap[selectedEffort]) {
						exactCliModelId = modelDef.effortModelMap[selectedEffort];
					}

					args.push('--model', exactCliModelId);
				}
			}
		}

		// Execution mode if specified
		if (config.defaultMode && config.defaultMode.trim()) {
			args.push(`--mode=${config.defaultMode.trim()}`);
		}

		// Extra user flags
		if (config.extraCliFlags && config.extraCliFlags.trim()) {
			const extra = config.extraCliFlags.trim().split(/\s+/);
			args.push(...extra);
		}

		return args;
	}

	public async sendPrompt(
		prompt: string,
		callbacks: CliStreamCallbacks,
		options?: SendPromptOptions
	): Promise<void> {
		this.abort();

		const settings = this.getSettings();
		const providerId = settings.activeProvider || 'antigravity';
		const config = this.getActiveProviderConfig();
		const vaultPath = this.getVaultBasePath();
		const args: string[] = [];

		const { command, prefixArgs } = this.resolveExecution(config, providerId, vaultPath);
		args.push(...prefixArgs);
		args.push(...this.buildPromptArgs(providerId, config, prompt, options));

		let fullResponse = '';
		let errorOutput = '';
		let codexJsonBuffer = '';

		try {
			const child = this.spawner(command, args, {
				cwd: config.useWsl ? undefined : vaultPath,
				env: AgyCliService.getSpawnEnvironment(),
				shell: false,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			this.activeProcess = child;
			if (child.stdin) {
				child.stdin.on('error', () => {});
				if (providerId === 'pi' || providerId === 'codex' || providerId === 'claude') {
					child.stdin.write(prompt, 'utf8');
					child.stdin.end();
				} else {
					child.stdin.end();
				}
			}

			child.stdout?.on('data', (data: Buffer) => {
				const chunk = data.toString();

				if (providerId === 'codex') {
					codexJsonBuffer += chunk;
					const lines = codexJsonBuffer.split('\n');
					codexJsonBuffer = lines.pop() || '';

					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed) continue;
						if (trimmed.startsWith('{')) {
							try {
								const event = JSON.parse(trimmed) as {
									type?: string;
									thread_id?: string;
									item?: { type?: string; text?: string };
									delta?: { text?: string };
								};
								if (event.type === 'thread.started' && event.thread_id) {
									this.setConversationId(event.thread_id);
									callbacks.onConversationId?.(event.thread_id);
								} else if (event.type === 'item.completed') {
									if (event.item?.type === 'agent_message' && event.item?.text) {
										const text = event.item.text;
										const tokenChunk = fullResponse && !fullResponse.endsWith('\n\n') ? `\n\n${text}` : text;
										fullResponse += tokenChunk;
										callbacks.onToken?.(tokenChunk);
									}
								} else if (event.type === 'item.delta') {
									const deltaText = event.delta?.text || event.item?.text || '';
									if (deltaText) {
										fullResponse += deltaText;
										callbacks.onToken?.(deltaText);
									}
								}
							} catch {
								fullResponse += trimmed + '\n';
								callbacks.onToken?.(trimmed + '\n');
							}
						} else {
							fullResponse += trimmed + '\n';
							callbacks.onToken?.(trimmed + '\n');
						}
					}
				} else {
					fullResponse += chunk;

					const match = chunk.match(/conversation[:\s]+([a-zA-Z0-9_-]{8,})/i) ||
						chunk.match(/session[:\s]+([a-zA-Z0-9_-]{8,})/i) ||
						chunk.match(/resume[:\s]+([a-zA-Z0-9_-]{8,})/i) ||
						chunk.match(/"session_id"\s*:\s*"([a-zA-Z0-9_-]+)"/i);
					if (match && match[1]) {
						this.setConversationId(match[1]);
						callbacks.onConversationId?.(match[1]);
					}

					callbacks.onToken?.(chunk);
				}
			});

			child.stderr?.on('data', (data: Buffer) => {
				const chunk = data.toString();
				errorOutput += chunk;
			});

			child.on('error', (err: Error) => {
				this.activeProcess = null;
				const msg = `Failed to spawn "${command}": ${err.message}. Ensure "${config.cliCommand}" is installed and on your PATH.`;
				callbacks.onError?.(msg);
			});

			child.on('close', (code: number | null, signal: string | null) => {
				this.activeProcess = null;

				if (providerId === 'codex' && codexJsonBuffer.trim()) {
					const trimmed = codexJsonBuffer.trim();
					if (trimmed.startsWith('{')) {
						try {
							const event = JSON.parse(trimmed) as {
								type?: string;
								thread_id?: string;
								item?: { type?: string; text?: string };
							};
							if (event.type === 'thread.started' && event.thread_id) {
								this.setConversationId(event.thread_id);
								callbacks.onConversationId?.(event.thread_id);
							} else if (event.item?.type === 'agent_message' && event.item?.text) {
								const text = event.item.text;
								const tokenChunk = fullResponse && !fullResponse.endsWith('\n\n') ? `\n\n${text}` : text;
								fullResponse += tokenChunk;
								callbacks.onToken?.(tokenChunk);
							}
						} catch {
							fullResponse += trimmed;
							callbacks.onToken?.(trimmed);
						}
					} else {
						fullResponse += trimmed;
						callbacks.onToken?.(trimmed);
					}
				}

				if (signal === 'SIGINT' || signal === 'SIGTERM') {
					callbacks.onComplete?.(fullResponse + '\n\n*(Generation stopped)*', this.getConversationId() || undefined);
					return;
				}

				if (code === 0) {
					callbacks.onComplete?.(fullResponse, this.getConversationId() || undefined);
				} else {
					let finalError = errorOutput
						.replace(/Reading additional input from stdin\.\.\./g, '')
						.trim();
					if (!finalError && fullResponse.trim()) {
						callbacks.onComplete?.(fullResponse, this.getConversationId() || undefined);
						return;
					}
					if (!finalError) {
						finalError = `Process exited with code ${code}`;
					}

					const errorCheck = (finalError + ' ' + fullResponse).toLowerCase();
					if (providerId === 'claude' && errorCheck.includes('not logged in')) {
						finalError = 'Claude Code CLI is not signed in. Run "claude auth login" in your terminal to authenticate.';
					} else if (
						providerId === 'codex' &&
						(errorCheck.includes('not logged in') ||
						 errorCheck.includes('not authenticated') ||
						 errorCheck.includes('logged out') ||
						 errorCheck.includes('login required') ||
						 (errorCheck.includes('unauthorized') && !errorCheck.includes('allow-all')))
					) {
						finalError = 'OpenAI Codex CLI is not signed in. Run "codex login" in your terminal to sign in.';
					} else if (
						providerId === 'copilot' &&
						(errorCheck.includes('not authenticated') ||
						 errorCheck.includes('not logged in') ||
						 errorCheck.includes('authentication failed') ||
						 errorCheck.includes('oauth token required') ||
						 errorCheck.includes('unauthorized'))
					) {
						finalError = 'GitHub Copilot CLI is not signed in. Run "copilot login" in your terminal to authenticate.';
					} else if (
						providerId === 'antigravity' &&
						(errorCheck.includes('not authenticated') ||
						 errorCheck.includes('please sign in') ||
						 errorCheck.includes('authentication failed') ||
						 errorCheck.includes('oauth_creds') ||
						 errorCheck.includes('401 unauthorized'))
					) {
						finalError = 'Google Antigravity CLI is not signed in. Run "agy" in your terminal to authenticate.';
					}

					// Automatic fallback for Copilot if a specific model flag is not available in user's plan
					if (
						providerId === 'copilot' &&
						config.selectedModel &&
						config.selectedModel !== 'auto' &&
						(finalError.includes('from --model flag is not available') || fullResponse.includes('from --model flag is not available'))
					) {
						const unavailableModel = config.selectedModel;
						console.warn(`[Sidecar AI] Model "${unavailableModel}" is not available in Copilot plan. Retrying with Copilot Fusion (Auto).`);
						config.selectedModel = 'auto';
						void this.saveSettings(this.getSettings());
						callbacks.onToken?.(`*(Model "${unavailableModel}" is not available on your Copilot plan (Free tier only includes Copilot Fusion). Automatically switched to Copilot Fusion (Auto)...)*\n\n`);
						void this.sendPrompt(prompt, callbacks, options);
						return;
					}

					callbacks.onError?.(finalError);
				}
			});
		} catch (err: unknown) {
			this.activeProcess = null;
			const msg = err instanceof Error ? err.message : String(err);
			callbacks.onError?.(`Spawn exception: ${msg}`);
		}
	}
}
