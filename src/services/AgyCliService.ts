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
		const fallbackList = settings.cachedModels && settings.cachedModels.length > 0
			? settings.cachedModels
			: ANTIGRAVITY_2_MODELS;

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

			// Strict timeout of 2.5 seconds to prevent indefinite spinning
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
			}, 2500);

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

	private parseModelsOutput(rawText: string): ModelDefinition[] {
		const lines = rawText.split('\n');
		const models: ModelDefinition[] = [];
		const seen = new Set<string>();

		for (let line of lines) {
			line = line.trim();
			if (!line || line.startsWith('#') || line.toLowerCase().includes('available models:')) {
				continue;
			}

			// Strip bullet points and leading symbols
			let cleanLine = line.replace(/^[\*\->\•\s\d\.\)]+/, '').trim();
			if (!cleanLine) continue;

			// Remove noisy effort tags from model title (e.g. "(High)", "(Medium)", "(Low)", "(Fast)")
			let cleanLabel = cleanLine.replace(/\((High|Medium|Low|Fast)\)/gi, '').trim();
			// Remove noisy leading effort words (e.g. "high Gemini 3.1 Pro" -> "Gemini 3.1 Pro")
			cleanLabel = cleanLabel.replace(/^(high|medium|low|fast)\s+/i, '').trim();

			// Extract ID
			let id = cleanLine.toLowerCase().replace(/[^a-z0-9\-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
			
			// Match with known Antigravity models if available
			const known = ANTIGRAVITY_2_MODELS.find(m =>
				cleanLabel.toLowerCase().includes(m.label.toLowerCase()) ||
				m.id.toLowerCase().includes(id) ||
				id.includes(m.id.toLowerCase())
			);

			if (known) {
				id = known.id;
				cleanLabel = known.label;
			}

			if (id && !seen.has(id)) {
				seen.add(id);

				const efforts = known ? known.efforts : (id.includes('claude') ? [] : ['Low', 'Medium', 'High']);
				const defaultEffort = 'Medium';

				models.push({
					id,
					label: cleanLabel || id,
					efforts,
					defaultEffort
				});
			}
		}

		return models.length > 0 ? models : ANTIGRAVITY_2_MODELS;
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

		// Prompt mode flag
		args.push('-p', prompt);

		// Output format: stream text
		args.push('--output-format', 'text');

		// Model selection
		if (settings.selectedModel) {
			args.push('--model', settings.selectedModel);

			// Check if this model has a selected effort
			const modelEffort = settings.modelEfforts?.[settings.selectedModel] || 'Medium';
			const currentModelDef = (settings.cachedModels || ANTIGRAVITY_2_MODELS).find(m => m.id === settings.selectedModel);
			
			// Only pass effort flag if model supports effort
			if (currentModelDef && currentModelDef.efforts && currentModelDef.efforts.length > 0) {
				args.push('--effort', modelEffort.toLowerCase());
			}
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
			});

			this.activeProcess = child;

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
