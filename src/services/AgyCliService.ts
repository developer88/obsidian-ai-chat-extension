import { spawn, ChildProcess } from 'child_process';
import { App, FileSystemAdapter } from 'obsidian';
import {
	AiChatPluginSettings,
	CliStreamCallbacks,
	ModelDefinition,
	AiProviderId,
	ProviderConfig,
	ANTIGRAVITY_MODELS,
	PI_DEFAULT_MODELS,
	DEFAULT_PROVIDER_CONFIGS,
	PROVIDER_METADATA
} from '../types';

export class AgyCliService {
	private activeProcess: ChildProcess | null = null;

	constructor(
		private app: App,
		private getSettings: () => AiChatPluginSettings,
		private saveSettings: (settings: AiChatPluginSettings) => Promise<void>
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
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
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

	private resolveExecution(
		config: ProviderConfig,
		targetProvider: AiProviderId,
		vaultPath?: string
	): { command: string; prefixArgs: string[] } {
		const defaultCmd = PROVIDER_METADATA[targetProvider]?.defaultCmd || 'agy';
		const rawCmd = config.cliCommand || defaultCmd;

		if (config.useWsl) {
			const prefixArgs = ['-d', 'Ubuntu'];
			if (vaultPath) {
				prefixArgs.push('--cd', this.toWslPath(vaultPath));
			}
			prefixArgs.push('--', rawCmd);
			return { command: 'wsl', prefixArgs };
		}

		if (process.platform === 'win32') {
			if (targetProvider === 'pi' || rawCmd.toLowerCase() === 'pi' || rawCmd.toLowerCase().endsWith('.cmd') || rawCmd.toLowerCase().endsWith('.bat')) {
				return { command: 'cmd.exe', prefixArgs: ['/c', rawCmd] };
			}
			if (!rawCmd.toLowerCase().endsWith('.exe') && !rawCmd.includes('\\') && !rawCmd.includes('/')) {
				return { command: `${rawCmd}.exe`, prefixArgs: [] };
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
				const child = spawn(command, args, {
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

	public async fetchAvailableModels(providerId?: AiProviderId): Promise<ModelDefinition[]> {
		const settings = this.getSettings();
		const targetProvider = providerId || settings.activeProvider || 'antigravity';
		const config = (settings.providers && settings.providers[targetProvider]) || DEFAULT_PROVIDER_CONFIGS[targetProvider];

		const queryFlag = targetProvider === 'copilot'
			? '--help'
			: (targetProvider === 'pi' ? '--list-models' : 'models');

		const { command, prefixArgs } = this.resolveExecution(config, targetProvider);
		const args = [...prefixArgs, queryFlag];

		return new Promise((resolve) => {
			let output = '';

			try {
				const child = spawn(command, args, {
					shell: false,
					timeout: 10000,
					stdio: ['ignore', 'pipe', 'pipe']
				});

				child.stdout?.on('data', (data: Buffer | string) => {
					output += data.toString();
				});

				child.on('error', (err: Error) => {
					console.warn(`[Sidecar AI] Could not query ${targetProvider} CLI:`, err);
					resolve(config.cachedModels || []);
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
									settings.providers[targetProvider].cachedModels = parsed;
									await this.saveSettings(settings);
								}
								resolve(parsed);
								return;
							}
						}
						resolve(config.cachedModels || (targetProvider === 'antigravity' ? ANTIGRAVITY_MODELS : (targetProvider === 'pi' ? PI_DEFAULT_MODELS : [])));
					})();
				});
			} catch {
				resolve(config.cachedModels || (targetProvider === 'antigravity' ? ANTIGRAVITY_MODELS : (targetProvider === 'pi' ? PI_DEFAULT_MODELS : [])));
			}
		});
	}

	private parseCopilotModels(rawOutput: string): ModelDefinition[] {
		// Parse models from copilot CLI help/output if available
		const models: ModelDefinition[] = [];
		const modelMatch = rawOutput.match(/--model\s+<model>\s+.*?(?:\n\s{2,}.*?)*/i);
		if (modelMatch) {
			const text = modelMatch[0];
			const choicesMatch = text.match(/\(choices:\s*([^)]+)\)/i);
			if (choicesMatch) {
				const items = choicesMatch[1].split(/,\s*/);
				for (const item of items) {
					const cleaned = item.replace(/['"]/g, '').trim();
					if (cleaned) {
						models.push({
							id: cleaned,
							label: cleaned,
							efforts: []
						});
					}
				}
			}
		}
		return models;
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
					grouped.set(baseId, {
						label: baseLabel,
						efforts: [],
						map: {}
					});
				}
				const entry = grouped.get(baseId)!;
				if (!entry.efforts.includes(effortTitle)) {
					entry.efforts.push(effortTitle);
				}
				entry.map[effortRaw] = id;
			} else {
				if (!grouped.has(id)) {
					grouped.set(id, {
						label,
						efforts: [],
						map: {}
					});
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
			if (!line || line.startsWith('provider') || line.startsWith('---') || line.startsWith('ID')) {
				continue;
			}

			const parts = line.split(/\s+/);
			if (parts.length < 2) continue;

			const provider = parts[0];
			const model = parts[1];
			const isThinking = parts.length >= 5 && parts[4].toLowerCase() === 'yes';

			const providerFormatted = provider.charAt(0).toUpperCase() + provider.slice(1);
			const cleanModel = model
				.split('-')
				.map(w => w.charAt(0).toUpperCase() + w.slice(1))
				.join(' ');

			const label = `${cleanModel} (${providerFormatted})`;
			const efforts = isThinking ? ['Off', 'Low', 'Medium', 'High', 'Max'] : [];

			models.push({
				id: model,
				label,
				efforts,
				defaultEffort: isThinking ? 'High' : undefined
			});
		}

		return models.length > 0 ? models : PI_DEFAULT_MODELS;
	}

	public async sendPrompt(
		prompt: string,
		callbacks: CliStreamCallbacks
	): Promise<void> {
		this.abort();

		const settings = this.getSettings();
		const providerId = settings.activeProvider || 'antigravity';
		const config = this.getActiveProviderConfig();
		const vaultPath = this.getVaultBasePath();
		const args: string[] = [];

		const { command, prefixArgs } = this.resolveExecution(config, providerId, vaultPath);
		args.push(...prefixArgs);

		// Prompt argument
		args.push('-p', prompt);

		if (providerId === 'copilot') {
			// Copilot CLI flags
			args.push('-s'); // Silent mode (only response)
			args.push('--allow-all-tools'); // Allow tools non-interactively
			args.push('--output-format', 'text');

			if (config.selectedModel) {
				args.push('--model', config.selectedModel);
			}

			// Resume session if exists
			if (config.conversationId) {
				args.push(`--resume=${config.conversationId}`);
			}
		} else if (providerId === 'pi') {
			// Pi Coding Agent flags
			if (config.selectedModel) {
				args.push('--model', config.selectedModel);
			}

			const selectedEffort = (config.modelEfforts?.[config.selectedModel] || 'high').toLowerCase();
			if (selectedEffort && selectedEffort !== 'off') {
				args.push('--thinking', selectedEffort);
			} else if (selectedEffort === 'off') {
				args.push('--thinking', 'off');
			}

			if (config.conversationId) {
				args.push('--session', config.conversationId);
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

			// Resume session if exists
			if (config.conversationId) {
				args.push('--conversation', config.conversationId);
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

		let fullResponse = '';
		let errorOutput = '';

		try {
			const child = spawn(command, args, {
				cwd: config.useWsl ? undefined : vaultPath,
				env: {
					...process.env,
					PAGER: 'cat',
					CI: '1',
				},
				shell: false,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			this.activeProcess = child;
			// Close stdin immediately to prevent CLI tools like pi from waiting for piped input
			child.stdin?.end();

			child.stdout?.on('data', (data: Buffer) => {
				const chunk = data.toString();
				fullResponse += chunk;

				const match = chunk.match(/conversation[:\s]+([a-zA-Z0-9_-]{8,})/i) ||
					chunk.match(/session[:\s]+([a-zA-Z0-9_-]{8,})/i);
				if (match && match[1]) {
					this.setConversationId(match[1]);
					callbacks.onConversationId?.(match[1]);
				}

				callbacks.onToken?.(chunk);
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

				if (signal === 'SIGINT' || signal === 'SIGTERM') {
					callbacks.onComplete?.(fullResponse + '\n\n*(Generation stopped)*', this.getConversationId() || undefined);
					return;
				}

				if (code === 0) {
					callbacks.onComplete?.(fullResponse, this.getConversationId() || undefined);
				} else {
					let finalError = errorOutput.trim();
					if (!finalError && fullResponse.trim()) {
						callbacks.onComplete?.(fullResponse, this.getConversationId() || undefined);
						return;
					}
					if (!finalError) {
						finalError = `Process exited with code ${code}`;
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
