import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { AntigravityPluginSettings, DEFAULT_SETTINGS, ANTIGRAVITY_2_MODELS } from './types';
import { AgyCliService } from './services/AgyCliService';
import { AntigravityChatView, ANTIGRAVITY_CHAT_VIEW_TYPE } from './views/AntigravityChatView';
import { AntigravitySettingTab } from './settings';
import { ModelSuggestModal } from './modals/ModelSuggestModal';

export default class AntigravityPlugin extends Plugin {
	settings: AntigravityPluginSettings = DEFAULT_SETTINGS;
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
				}
			)
		);

		// Add Ribbon Icon
		this.addRibbonIcon('bot', 'Antigravity AI Chat', async () => {
			await this.activateView();
		});

		// Command: Open Chat Sidebar
		this.addCommand({
			id: 'open-antigravity-chat',
			name: 'Open Antigravity Chat Sidebar',
			callback: async () => {
				await this.activateView();
			},
		});

		// Command: Switch Model & Effort
		this.addCommand({
			id: 'switch-antigravity-model',
			name: 'Switch Model & Reasoning Effort',
			callback: () => {
				new ModelSuggestModal(this.app, this).open();
			},
		});

		// Command: Restart Session
		this.addCommand({
			id: 'restart-antigravity-session',
			name: 'Restart Antigravity Session (New Chat)',
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

		const models = (this.settings.cachedModels && this.settings.cachedModels.length > 0)
			? this.settings.cachedModels
			: ANTIGRAVITY_2_MODELS;

		const currentId = this.settings.selectedModel || 'gemini-3.8-flash';
		const modelDef = models.find(m => m.id === currentId || currentId.startsWith(m.id));

		const label = modelDef ? modelDef.label : currentId;
		let effortSuffix = '';

		if (modelDef && modelDef.efforts && modelDef.efforts.length > 1) {
			const effort = this.settings.modelEfforts?.[modelDef.id] || modelDef.defaultEffort || 'Medium';
			effortSuffix = ` (${effort})`;
		}

		this.statusBarItemEl.setText(`⚡ ${label}${effortSuffix}`);
		this.statusBarItemEl.setAttribute('aria-label', `Antigravity Model: ${label}${effortSuffix} (Click to switch)`);
	}

	public async switchModel(modelId: string, effort?: string): Promise<void> {
		this.settings.selectedModel = modelId;
		if (effort) {
			if (!this.settings.modelEfforts) {
				this.settings.modelEfforts = {};
			}
			this.settings.modelEfforts[modelId] = effort;
		}

		await this.saveData(this.settings);
		this.updateStatusBar();

		// Notify open chat views to update dropdown
		const leaves = this.app.workspace.getLeavesOfType(ANTIGRAVITY_CHAT_VIEW_TYPE);
		leaves.forEach((leaf) => {
			if (leaf.view instanceof AntigravityChatView) {
				leaf.view.updateModelSelectionFromSettings();
			}
		});

		const models = (this.settings.cachedModels && this.settings.cachedModels.length > 0)
			? this.settings.cachedModels
			: ANTIGRAVITY_2_MODELS;
		const modelDef = models.find(m => m.id === modelId);
		const label = modelDef ? modelDef.label : modelId;
		const effortStr = effort ? ` (${effort})` : '';

		new Notice(`Antigravity: ${label}${effortStr}`);
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
