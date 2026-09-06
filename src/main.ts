import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import {
	AiChatPluginSettings,
	DEFAULT_SETTINGS,
	AiProviderId,
	PROVIDER_METADATA,
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
					// @ts-ignore
					this.app.setting.open();
					// @ts-ignore
					this.app.setting.openTabById(this.manifest.id);
				},
				() => {
					new ModelSuggestModal(this.app, this).open();
				}
			)
		);

		// Add Ribbon Icon
		this.addRibbonIcon('bot', 'Obsichat', async () => {
			await this.activateView();
		});

		// Command: Open Chat Sidebar
		this.addCommand({
			id: 'open-antigravity-chat',
			name: 'Open Obsichat Sidebar',
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
			this.statusBarItemEl.style.display = 'none';
			return;
		}

		this.statusBarItemEl.style.display = '';

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
		this.statusBarItemEl.setAttribute('aria-label', `Obsichat: ${label}${effortSuffix} (Click to switch)`);
	}

	public async switchModelForActiveProvider(modelId: string, effort?: string): Promise<void> {
		const provId = this.settings.activeProvider || 'antigravity';

		if (!this.settings.providers) {
			this.settings.providers = JSON.parse(JSON.stringify(DEFAULT_PROVIDER_CONFIGS));
		}
		if (!this.settings.providers[provId]) {
			this.settings.providers[provId] = JSON.parse(JSON.stringify(DEFAULT_PROVIDER_CONFIGS[provId]));
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
			workspace.revealLeaf(leaf);
			if (leaf.view instanceof AntigravityChatView) {
				leaf.view.updateActiveDocumentContext();
			}
		}
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		if (!this.settings.providers) {
			this.settings.providers = JSON.parse(JSON.stringify(DEFAULT_PROVIDER_CONFIGS));
		}
		if (data?.cliCommand && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.cliCommand = data.cliCommand;
		}
		if (data?.useWsl !== undefined && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.useWsl = data.useWsl;
		}
		if (data?.selectedModel && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.selectedModel = data.selectedModel;
		}
		if (data?.modelEfforts && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.modelEfforts = Object.assign({}, this.settings.providers.antigravity.modelEfforts, data.modelEfforts);
		}
		if (data?.cachedModels && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.cachedModels = data.cachedModels;
		}
		if (data?.extraCliFlags && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.extraCliFlags = data.extraCliFlags;
		}
		if (data?.defaultMode && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.defaultMode = data.defaultMode;
		}
		if (data?.conversationId && this.settings.providers.antigravity) {
			this.settings.providers.antigravity.conversationId = data.conversationId;
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
