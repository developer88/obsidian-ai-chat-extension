import { spawn, ChildProcess } from 'child_process';
import { App, FileSystemAdapter, Notice } from 'obsidian';
import {
	AntigravityPluginSettings,
	CliStreamCallbacks,
	ModelDefinition,
	ANTIGRAVITY_2_MODELS
} from '../types';

export class AgyCliService {
	private activeProcess: ChildProcess | null = null;
	private currentConversationId: string | null = null;

	constructor(
		private app: App,
		private getSettings: () => AntigravityPluginSettings,
		private saveSettings: (settings: AntigravityPluginSettings) => Promise<void>
	) {
		const settings = this.getSettings();
		this.currentConversationId = settings.conversationId || null;
	}

	public getConversationId(): string | null {
		return this.currentConversationId;
	}

	public setConversationId(id: string | null): void {
		this.currentConversationId = id;
		const settings = this.getSettings();
		settings.conversationId = id;
		this.saveSettings(settings);
	}

	public isRunning(): boolean {
		return this.activeProcess !== null && !this.activeProcess.killed;
	}

	public abort(): void {
		if (this.activeProcess && !this.activeProcess.killed) {
			try {
				this.activeProcess.kill('SIGINT');
				setTimeout(() => {
					if (this.activeProcess && !this.activeProcess.killed) {
						this.activeProcess.kill('SIGTERM');
					}
				}, 400);
			} catch (e) {
				console.error('[Antigravity] Error killing process:', e);
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
		return process.cwd();
	}

	private toWslPath(windowsPath: string): string {
		const match = windowsPath.match(/^([a-zA-Z]):\\(.*)$/);
		if (match) {
			const drive = match[1].toLowerCase();
			const rest = match[2].replace(/\\/g, '/');
			return `/mnt/${drive}/${rest}`;
		}
		return windowsPath.replace(/\\/g, '/');
	}

	private stripAnsi(text: string): string {
		// Remove ANSI escape codes
		// eslint-disable-next-line no-control-regex
		return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
	}

	public async fetchAvailableModels(): Promise<ModelDefinition[]> {
		const settings = this.getSettings();
		const fallbackList = ANTIGRAVITY_2_MODELS;

		const vaultPath = this.getVaultBasePath();
		const args: string[] = [];

		let command = settings.cliCommand || 'agy';
		let spawnCwd = vaultPath;

		if (settings.useWsl) {
			command = 'wsl';
			const wslVaultPath = this.toWslPath(vaultPath);
			args.push('-d', 'Ubuntu', '--cd', wslVaultPath, '--', settings.cliCommand || 'agy');
		}

		args.push('models');

		return new Promise<ModelDefinition[]>((resolve) => {
			let output = '';
			let resolved = false;

			const finish = (result: ModelDefinition[]) => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timer);
					resolve(result);
				}
			};

			// Strict timeout of 3.5 seconds
			const timer = setTimeout(() => {
				if (!resolved) {
					try {
						if (child && !child.killed) {
							child.kill();
						}
					} catch (e) {
						// ignore
					}
					finish(fallbackList);
				}
			}, 3500);

			let child: ChildProcess;
			try {
				const isWindows = process.platform === 'win32';
				child = spawn(command, args, {
					cwd: settings.useWsl ? undefined : spawnCwd,
					env: {
						...process.env,
						PAGER: 'cat',
						CI: '1',
					},
					shell: !settings.useWsl && isWindows,
				});

				child.stdout?.on('data', (data: Buffer) => {
					output += this.stripAnsi(data.toString('utf8'));
				});

				child.on('error', () => {
					finish(fallbackList);
				});

				child.on('close', async (code: number) => {
					if (code === 0 && output.trim().length > 0) {
						const parsed = this.parseModelsOutput(output);
						if (parsed.length > 0) {
							settings.cachedModels = parsed;
							await this.saveSettings(settings);
							finish(parsed);
							return;
						}
					}
					finish(fallbackList);
				});
			} catch (e) {
				finish(fallbackList);
			}
		});
	}

	public parseModelsOutput(rawText: string): ModelDefinition[] {
		const lines = rawText.split('\n');
		const groupedMap = new Map<string, ModelDefinition>();

		for (let line of lines) {
			line = line.trim();
			if (!line || line.startsWith('#') || line.toLowerCase().includes('fetching available models')) {
				continue;
			}

			// Split line into ID and display label (tab or multiple spaces)
			const parts = line.split(/\t+|\s{2,}/);
			const rawId = parts[0]?.trim();
			const rawDisplayName = (parts[1] || parts[0] || '').trim();

			if (!rawId) continue;

			// Check for effort suffix in ID (e.g. "gemini-3.8-flash-medium" or "gemini-3.1-pro-low")
			const effortMatch = rawId.match(/^(.+)-(low|medium|high|max)$/i);

			let baseId = rawId;
			let effortName: string | null = null;

			if (effortMatch) {
				baseId = effortMatch[1];
				const rawEffort = effortMatch[2].toLowerCase();
				effortName = rawEffort.charAt(0).toUpperCase() + rawEffort.slice(1);
			}

			// Clean display name by stripping "(High)", "(Medium)", "(Low)", etc.
			let cleanLabel = rawDisplayName.replace(/\((High|Medium|Low|Max|Fast)\)/gi, '').trim();
			if (!cleanLabel) {
				// Format base ID into Title Case
				cleanLabel = baseId
					.split('-')
					.map(s => s.charAt(0).toUpperCase() + s.slice(1))
					.join(' ');
			}

			if (!groupedMap.has(baseId)) {
				groupedMap.set(baseId, {
					id: baseId,
					label: cleanLabel,
					efforts: effortName ? [effortName] : [],
					defaultEffort: 'Medium',
					effortModelMap: effortName ? { [effortName.toLowerCase()]: rawId } : {}
				});
			} else {
				const existing = groupedMap.get(baseId)!;
				if (effortName && !existing.efforts.includes(effortName)) {
					existing.efforts.push(effortName);
					if (!existing.effortModelMap) {
						existing.effortModelMap = {};
					}
					existing.effortModelMap[effortName.toLowerCase()] = rawId;
				}
			}
		}

		// Sort efforts consistently: Low -> Medium -> High -> Max
		const effortOrder = ['Low', 'Medium', 'High', 'Max'];
		const result: ModelDefinition[] = [];

		for (const model of groupedMap.values()) {
			if (model.efforts.length > 0) {
				model.efforts.sort((a, b) => {
					const idxA = effortOrder.indexOf(a);
					const idxB = effortOrder.indexOf(b);
					return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
				});
				model.defaultEffort = model.efforts.includes('Medium') ? 'Medium' : model.efforts[0];
			}
			result.push(model);
		}

		return result.length > 0 ? result : ANTIGRAVITY_2_MODELS;
	}

	public async sendPrompt(
		prompt: string,
		callbacks: CliStreamCallbacks
	): Promise<void> {
		this.abort();

		const settings = this.getSettings();
		const vaultPath = this.getVaultBasePath();
		const args: string[] = [];

		let command = settings.cliCommand || 'agy';
		let spawnCwd = vaultPath;

		if (settings.useWsl) {
			command = 'wsl';
			const wslVaultPath = this.toWslPath(vaultPath);
			args.push('-d', 'Ubuntu', '--cd', wslVaultPath, '--', settings.cliCommand || 'agy');
		}

		// Read prompt from stdin via '-p -' to avoid command line length limits
		args.push('-p', '-');

		// Output format: stream text
		args.push('--output-format', 'text');

		// Model selection
		if (settings.selectedModel) {
			const models = settings.cachedModels && settings.cachedModels.length > 0
				? settings.cachedModels
				: ANTIGRAVITY_2_MODELS;

			const modelDef = models.find(m => m.id === settings.selectedModel);
			const selectedEffort = (settings.modelEfforts?.[settings.selectedModel] || modelDef?.defaultEffort || 'Medium').toLowerCase();

			let exactCliModelId = settings.selectedModel;

			if (modelDef && modelDef.effortModelMap && modelDef.effortModelMap[selectedEffort]) {
				exactCliModelId = modelDef.effortModelMap[selectedEffort];
			}

			args.push('--model', exactCliModelId);
		}

		// Resume session if active conversation exists
		if (this.currentConversationId) {
			args.push('--conversation', this.currentConversationId);
		}

		// Execution mode if specified
		if (settings.defaultMode && settings.defaultMode.trim()) {
			args.push(`--mode=${settings.defaultMode.trim()}`);
		}

		// Extra user flags
		if (settings.extraCliFlags && settings.extraCliFlags.trim()) {
			const extra = settings.extraCliFlags.trim().split(/\s+/);
			args.push(...extra);
		}

		let fullResponse = '';
		let errorOutput = '';

		try {
			const isWindows = process.platform === 'win32';
			const child = spawn(command, args, {
				cwd: settings.useWsl ? undefined : spawnCwd,
				env: {
					...process.env,
					PAGER: 'cat',
					CI: '1',
				},
				shell: !settings.useWsl && isWindows,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			this.activeProcess = child;

			// Write prompt to stdin and close stdin stream
			if (child.stdin) {
				child.stdin.write(prompt, 'utf8', (err) => {
					if (err) {
						console.error('[Antigravity] Stdin write error:', err);
					}
					child.stdin.end();
				});
			}

			child.stdout.on('data', (data: Buffer) => {
				const chunk = this.stripAnsi(data.toString('utf8'));
				fullResponse += chunk;

				const convMatch = chunk.match(/conversation[:\s]+([a-f0-9-]{8,})/i) ||
					chunk.match(/--conversation\s+([a-f0-9-]{8,})/i);
				if (convMatch && convMatch[1]) {
					this.setConversationId(convMatch[1]);
					callbacks.onConversationId?.(convMatch[1]);
				}

				callbacks.onToken?.(chunk);
			});

			child.stderr.on('data', (data: Buffer) => {
				const errChunk = this.stripAnsi(data.toString('utf8'));
				errorOutput += errChunk;

				const convMatch = errChunk.match(/conversation[:\s]+([a-f0-9-]{8,})/i) ||
					errChunk.match(/--conversation\s+([a-f0-9-]{8,})/i);
				if (convMatch && convMatch[1]) {
					this.setConversationId(convMatch[1]);
					callbacks.onConversationId?.(convMatch[1]);
				}
			});

			child.on('error', (err: Error) => {
				console.error('[Antigravity CLI Error]', err);
				this.activeProcess = null;
				new Notice(`Antigravity CLI failed to start: ${err.message}`);
				callbacks.onError?.(`Failed to execute CLI command (${command}): ${err.message}. Please check plugin settings.`);
			});

			child.on('close', (code: number) => {
				this.activeProcess = null;

				if (code === 0 || fullResponse.trim().length > 0) {
					callbacks.onComplete?.(fullResponse.trim(), this.currentConversationId || undefined);
				} else {
					const msg = errorOutput.trim() || `CLI exited with code ${code}`;
					callbacks.onError?.(msg);
				}
			});

		} catch (err: unknown) {
			this.activeProcess = null;
			const message = err instanceof Error ? err.message : String(err);
			callbacks.onError?.(`Process execution error: ${message}`);
		}
	}
}
