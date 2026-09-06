import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import {
	AiChatPluginSettings,
	DEFAULT_SETTINGS,
	AiProviderId,
	ProviderConfig,
	ModelDefinition,
	DEFAULT_PROVIDER_CONFIGS
} from './types';
import { AgyCliService } from './services/AgyCliService';
import { AntigravityChatView, ANTIGRAVITY_CHAT_VIEW_TYPE } from './views/AntigravityChatView';
import { AntigravitySettingTab } from './settings';
import { ModelSuggestModal } from './modals/ModelSuggestModal';

export default class AntigravityPlugin extends Plugin {
	settings: AiChatPluginSettings = DEFAULT_SETTINGS;
	cliService!: AgyCliService;
	private statusBarItemEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.cliService = new AgyCliService(
			this.app,
			() => this.settings,
			async (updated) => {
				this.settings = updated;
				await this.saveData(this.settings);
				this.updateStatusBar();
			}
		);

		// Status Bar Item
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.addClass('agy-status-bar-item');
		this.statusBarItemEl.addEventListener('click', () => {
			new ModelSuggestModal(this.app, this).open();
		});
		this.updateStatusBar();

		// Register Chat View
		this.registerView(
			ANTIGRAVITY_CHAT_VIEW_TYPE,
			(leaf) => new AntigravityChatView(
				leaf,
				this.cliService,
				() => this.settings,
				async (updated) => {
					this.settings = updated;
					await this.saveData(this.settings);
					this.updateStatusBar();
				},
				() => {
					const appWithSetting = this.app as unknown as {
						setting?: {
							open(): void;
							openTabById(id: string): void;
						};
					};
					if (appWithSetting.setting) {
						appWithSetting.setting.open();
						appWithSetting.setting.openTabById(this.manifest.id);
					}
				},
				() => {
					new ModelSuggestModal(this.app, this).open();
				}
			)
		);

		// Add Ribbon Icon
		this.addRibbonIcon('bot', 'Sidecar AI', async () => {
			await this.activateView();
		});

		// Command: Open Chat Sidebar
		this.addCommand({
			id: 'open-antigravity-chat',
			name: 'Open chat sidebar',
			callback: async () => {
				await this.activateView();
			},
		});

		// Command: Switch Model & Effort
		this.addCommand({
			id: 'switch-antigravity-model',
			name: 'Switch Model & Effort',
			callback: () => {
				new ModelSuggestModal(this.app, this).open();
			},
		});

		// Command: Restart Session
		this.addCommand({
			id: 'restart-antigravity-session',
			name: 'Restart Session (New Chat)',
			callback: () => {
				this.cliService.resetSession();
				const leaves = this.app.workspace.getLeavesOfType(ANTIGRAVITY_CHAT_VIEW_TYPE);
				leaves.forEach((leaf) => {
					if (leaf.view instanceof AntigravityChatView) {
						leaf.view.restartSession();
					}
				});
			},
		});

		// Settings Tab
		this.addSettingTab(new AntigravitySettingTab(this.app, this));
	}

	public updateStatusBar(): void {
		if (!this.statusBarItemEl) return;

		if (!this.settings.showStatusBarItem) {
			this.statusBarItemEl.setCssStyles({ display: 'none' });
			return;
		}

		this.statusBarItemEl.setCssStyles({ display: '' });

		const provId = this.settings.activeProvider || 'antigravity';
		const provConfig = this.settings.providers?.[provId];
		const models = provConfig?.cachedModels || [];

		const currentId = provConfig?.selectedModel || models[0]?.id || '';
		const modelDef = models.find(m => m.id === currentId || currentId.startsWith(m.id));

		const label = modelDef ? modelDef.label : (currentId || 'No model');
		let effortSuffix = '';

		if (modelDef && modelDef.efforts && modelDef.efforts.length > 1) {
			const effort = provConfig?.modelEfforts?.[modelDef.id] || modelDef.defaultEffort || 'Medium';
			effortSuffix = ` (${effort})`;
		}

		this.statusBarItemEl.setText(`⚡ ${label}${effortSuffix}`);
		this.statusBarItemEl.setAttribute('aria-label', `Sidecar AI: ${label}${effortSuffix} (Click to switch)`);
	}

	public async switchModelForActiveProvider(modelId: string, effort?: string): Promise<void> {
		const provId = this.settings.activeProvider || 'antigravity';

		if (!this.settings.providers) {
			this.settings.providers = JSON.parse(JSON.stringify(DEFAULT_PROVIDER_CONFIGS)) as Record<AiProviderId, ProviderConfig>;
		}
		if (!this.settings.providers[provId]) {
			this.settings.providers[provId] = JSON.parse(JSON.stringify(DEFAULT_PROVIDER_CONFIGS[provId])) as ProviderConfig;
		}

		const provConfig = this.settings.providers[provId];
		provConfig.selectedModel = modelId;

		if (effort) {
			if (!provConfig.modelEfforts) {
				provConfig.modelEfforts = {};
			}
			provConfig.modelEfforts[modelId] = effort;
		}

		await this.saveData(this.settings);
		this.updateStatusBar();

		// Notify open chat views to update trigger label in real time
		const leaves = this.app.workspace.getLeavesOfType(ANTIGRAVITY_CHAT_VIEW_TYPE);
		leaves.forEach((leaf) => {
			if (leaf.view instanceof AntigravityChatView) {
				leaf.view.updateModelSelectionFromSettings();
			}
		});

		const models = provConfig.cachedModels || [];
		const modelDef = models.find(m => m.id === modelId);
		const label = modelDef ? modelDef.label : modelId;
		const effortStr = effort ? ` (${effort})` : '';

		new Notice(`Model: ${label}${effortStr}`);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(ANTIGRAVITY_CHAT_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: ANTIGRAVITY_CHAT_VIEW_TYPE,
					active: true,
				});
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
			if (leaf.view instanceof AntigravityChatView) {
				leaf.view.updateActiveDocumentContext();
			}
		}
	}

	async loadSettings(): Promise<void> {
		interface LegacySettingsMigration {
			cliCommand?: string;
			useWsl?: boolean;
			selectedModel?: string;
			modelEfforts?: Record<string, string>;
			cachedModels?: ModelDefinition[];
			extraCliFlags?: string;
			defaultMode?: string;
			conversationId?: string | null;
		}

		const rawData = (await this.loadData()) as (Partial<AiChatPluginSettings> & LegacySettingsMigration) | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, rawData);

		if (!this.settings.providers) {
			this.settings.providers = JSON.parse(JSON.stringify(DEFAULT_PROVIDER_CONFIGS)) as Record<AiProviderId, ProviderConfig>;
		}
		if (rawData?.cliCommand && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.cliCommand = rawData.cliCommand;
		}
		if (rawData?.useWsl !== undefined && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.useWsl = rawData.useWsl;
		}
		if (rawData?.selectedModel && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.selectedModel = rawData.selectedModel;
		}
		if (rawData?.modelEfforts && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.modelEfforts = Object.assign({}, this.settings.providers.antigravity.modelEfforts, rawData.modelEfforts);
		}
		if (rawData?.cachedModels && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.cachedModels = rawData.cachedModels;
		}
		if (rawData?.extraCliFlags && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.extraCliFlags = rawData.extraCliFlags;
		}
		if (rawData?.defaultMode && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.defaultMode = rawData.defaultMode;
		}
		if (rawData?.conversationId && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.conversationId = rawData.conversationId;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.updateStatusBar();
	}

	onunload(): void {
		if (this.cliService) {
			this.cliService.abort();
		}
	}
}
