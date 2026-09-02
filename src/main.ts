import { Plugin, WorkspaceLeaf } from 'obsidian';
import { AntigravityPluginSettings, DEFAULT_SETTINGS } from './types';
import { AgyCliService } from './services/AgyCliService';
import { AntigravityChatView, ANTIGRAVITY_CHAT_VIEW_TYPE } from './views/AntigravityChatView';
import { AntigravitySettingTab } from './settings';

export default class AntigravityPlugin extends Plugin {
	settings: AntigravityPluginSettings = DEFAULT_SETTINGS;
	cliService!: AgyCliService;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.cliService = new AgyCliService(
			this.app,
			() => this.settings,
			async (updated) => {
				this.settings = updated;
				await this.saveData(this.settings);
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
					// Open settings tab
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
	}

	onunload(): void {
		if (this.cliService) {
			this.cliService.abort();
		}
	}
}
