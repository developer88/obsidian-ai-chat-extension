import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import {
	AiChatPluginSettings,
	DEFAULT_SETTINGS,
	AiProviderId,
	ModelDefinition,
	DEFAULT_PROVIDER_CONFIGS,
	COPILOT_DEFAULT_MODELS,
	cloneProviderConfig,
	cloneDefaultProviderConfigs,
	PROVIDER_METADATA
} from './types';
import { AgyCliService } from './services/AgyCliService';
import { AntigravityChatView, ANTIGRAVITY_CHAT_VIEW_TYPE } from './views/AntigravityChatView';
import { AntigravitySettingTab } from './settings';
import { ModelSuggestModal } from './modals/ModelSuggestModal';

export default class AntigravityPlugin extends Plugin {
	settings: AiChatPluginSettings = DEFAULT_SETTINGS;
	cliService!: AgyCliService;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.cliService = new AgyCliService(
			this.app,
			() => this.settings,
			async (updated) => {
				this.settings = updated;
				await this.saveData(this.settings);
			},
			undefined,
			(msg: string) => {
				new Notice(msg);
			}
		);

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
			name: 'Switch model & effort',
			callback: async () => {
				if (this.cliService.areAnyActiveCachesExpired(5 * 60 * 1000)) {
					try {
						await this.cliService.refreshAllActiveProviders();
					} catch {
						// ignore
					}
				}
				new ModelSuggestModal(this.app, this).open();
			},
		});

		// Command: Restart Session
		this.addCommand({
			id: 'restart-antigravity-session',
			name: 'Restart session (new chat)',
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

	public async switchProviderAndModel(providerId: AiProviderId, modelId: string, effort?: string): Promise<void> {
		this.settings.activeProvider = providerId;

		if (!this.settings.providers) {
			this.settings.providers = cloneDefaultProviderConfigs();
		}
		if (!this.settings.providers[providerId]) {
			this.settings.providers[providerId] = cloneProviderConfig(DEFAULT_PROVIDER_CONFIGS[providerId]);
		}

		const provConfig = this.settings.providers[providerId];
		provConfig.selectedModel = modelId;

		if (effort) {
			if (!provConfig.modelEfforts) {
				provConfig.modelEfforts = {};
			}
			provConfig.modelEfforts[modelId] = effort;
		}

		await this.saveData(this.settings);

		// Notify open chat views to update trigger label in real time
		const leaves = this.app.workspace.getLeavesOfType(ANTIGRAVITY_CHAT_VIEW_TYPE);
		leaves.forEach((leaf) => {
			if (leaf.view instanceof AntigravityChatView) {
				leaf.view.updateModelSelectionFromSettings();
			}
		});

		const provName = PROVIDER_METADATA[providerId]?.name || providerId;
		const models = provConfig.cachedModels || [];
		const modelDef = models.find(m => m.id === modelId);
		const label = modelDef ? modelDef.label : modelId;
		const effortStr = effort ? ` (${effort})` : '';

		new Notice(`${provName}: ${label}${effortStr}`);
	}

	public async switchModelForActiveProvider(modelId: string, effort?: string): Promise<void> {
		const provId = this.settings.activeProvider || 'antigravity';
		await this.switchProviderAndModel(provId, modelId, effort);
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
		this.settings = {
			...DEFAULT_SETTINGS,
			providers: cloneDefaultProviderConfigs(),
			...(rawData || {})
		};

		if (!this.settings.providers) {
			this.settings.providers = cloneDefaultProviderConfigs();
		} else {
			for (const provKey of Object.keys(DEFAULT_PROVIDER_CONFIGS) as AiProviderId[]) {
				if (!this.settings.providers[provKey]) {
					this.settings.providers[provKey] = cloneProviderConfig(DEFAULT_PROVIDER_CONFIGS[provKey]);
				}
			}
		}

		// Ensure copilot provider has 'auto' available and valid selectedModel
		if (this.settings.providers.copilot) {
			const copilotConfig = this.settings.providers.copilot;
			if (!copilotConfig.cachedModels || copilotConfig.cachedModels.length === 0) {
				copilotConfig.cachedModels = [...COPILOT_DEFAULT_MODELS];
			} else if (!copilotConfig.cachedModels.some(m => m.id === 'auto')) {
				copilotConfig.cachedModels.unshift({
					id: 'auto',
					label: 'Copilot Fusion (Auto - Recommended)',
					efforts: []
				});
			}
			if (!copilotConfig.selectedModel || !copilotConfig.cachedModels.some(m => m.id === copilotConfig.selectedModel)) {
				copilotConfig.selectedModel = 'auto';
			}
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

		// Ensure at least one provider is enabled for existing/migrated users
		const anyEnabled = Object.values(this.settings.providers || {}).some(p => p.enabled);
		if (!anyEnabled) {
			const activeId = this.settings.activeProvider || 'antigravity';
			if (this.settings.providers[activeId]) {
				this.settings.providers[activeId].enabled = true;
			}
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		const leaves = this.app.workspace.getLeavesOfType(ANTIGRAVITY_CHAT_VIEW_TYPE);
		leaves.forEach((leaf) => {
			if (leaf.view instanceof AntigravityChatView) {
				leaf.view.updateActiveDocumentContext();
			}
		});
	}

	onunload(): void {
		if (this.cliService) {
			this.cliService.abort();
		}
	}
}
