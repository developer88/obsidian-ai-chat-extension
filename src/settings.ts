import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type AntigravityPlugin from './main';
import {
	AiProviderId,
	ANTIGRAVITY_MODELS,
	COPILOT_MODELS,
	PROVIDER_METADATA
} from './types';
import { ModelSuggestModal } from './modals/ModelSuggestModal';

export class AntigravitySettingTab extends PluginSettingTab {
	plugin: AntigravityPlugin;

	constructor(app: App, plugin: AntigravityPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'AI Chat Settings' });
		containerEl.createEl('p', {
			text: 'Connects directly to your local AI CLI binaries (Google Antigravity & GitHub Copilot) without API tokens.',
			cls: 'setting-item-description'
		});

		const activeProvId = this.plugin.settings.activeProvider || 'antigravity';
		const provConfig = this.plugin.settings.providers?.[activeProvId];

		// Active AI Provider Selector
		new Setting(containerEl)
			.setName('Active AI Provider')
			.setDesc('Select which AI CLI provider powers your chat sessions.')
			.addDropdown(dropdown => {
				dropdown.addOption('antigravity', 'Google Antigravity (agy)');
				dropdown.addOption('copilot', 'GitHub Copilot (copilot)');
				dropdown.setValue(activeProvId);
				dropdown.onChange(async (value: string) => {
					this.plugin.settings.activeProvider = value as AiProviderId;
					await this.plugin.saveSettings();
					this.plugin.updateStatusBar();
					this.display();
				});
			});

		// Unified Model & Reasoning Effort Switcher Button
		const models = (provConfig?.cachedModels && provConfig.cachedModels.length > 0)
			? provConfig.cachedModels
			: (activeProvId === 'copilot' ? COPILOT_MODELS : ANTIGRAVITY_MODELS);
		const currentModelId = provConfig?.selectedModel || models[0]?.id || '';
		const currentModelObj = models.find(m => m.id === currentModelId || currentModelId.startsWith(m.id));
		const currentModelLabel = currentModelObj ? currentModelObj.label : currentModelId;

		let currentEffortStr = '';
		if (currentModelObj && currentModelObj.efforts && currentModelObj.efforts.length > 1) {
			const effort = provConfig?.modelEfforts?.[currentModelObj.id] || currentModelObj.defaultEffort || 'Medium';
			currentEffortStr = ` (${effort} effort)`;
		}

		const provName = PROVIDER_METADATA[activeProvId]?.name || activeProvId;

		new Setting(containerEl)
			.setName('Active Model & Reasoning Effort')
			.setDesc(`Currently: ${provName} • ${currentModelLabel}${currentEffortStr}`)
			.addButton(button => button
				.setButtonText('Select Model & Effort...')
				.setCta()
				.onClick(() => {
					new ModelSuggestModal(this.app, this.plugin).open();
				}))
			.addButton(button => button
				.setButtonText('Refresh from CLI')
				.setTooltip('Query CLI for updated models')
				.onClick(async () => {
					button.setButtonText('Querying...');
					button.setDisabled(true);
					const fetched = await this.plugin.cliService.fetchAvailableModels();
					new Notice(`Loaded ${fetched.length} models.`);
					this.display();
				}));

		containerEl.createEl('h3', { text: `${provName} Configuration` });

		// CLI Command / Path for Active Provider
		new Setting(containerEl)
			.setName(`${provName} CLI Command / Path`)
			.setDesc(`The command or full path to the executable (e.g. "${activeProvId === 'copilot' ? 'copilot' : 'agy'}").`)
			.addText(text => text
				.setPlaceholder(activeProvId === 'copilot' ? 'copilot' : 'agy')
				.setValue(provConfig?.cliCommand || (activeProvId === 'copilot' ? 'copilot' : 'agy'))
				.onChange(async (value) => {
					if (provConfig) {
						provConfig.cliCommand = value.trim() || (activeProvId === 'copilot' ? 'copilot' : 'agy');
						await this.plugin.saveSettings();
					}
				}));

		// Use WSL for Active Provider
		new Setting(containerEl)
			.setName(`Run ${provName} in WSL`)
			.setDesc(`Execute via Windows Subsystem for Linux (e.g. "wsl ${activeProvId === 'copilot' ? 'copilot' : 'agy'}"). Enable if installed in Ubuntu/WSL.`)
			.addToggle(toggle => toggle
				.setValue(provConfig?.useWsl || false)
				.onChange(async (value) => {
					if (provConfig) {
						provConfig.useWsl = value;
						await this.plugin.saveSettings();
					}
				}));

		// Extra Flags for Active Provider
		new Setting(containerEl)
			.setName(`Extra CLI Flags for ${provName}`)
			.setDesc('Additional flags passed on each invocation (e.g. "--allow-all-tools" or "--dangerously-skip-permissions").')
			.addText(text => text
				.setPlaceholder(activeProvId === 'copilot' ? '--allow-all-tools' : '--dangerously-skip-permissions')
				.setValue(provConfig?.extraCliFlags || '')
				.onChange(async (value) => {
					if (provConfig) {
						provConfig.extraCliFlags = value.trim();
						await this.plugin.saveSettings();
					}
				}));

		// General Chat Settings Section
		containerEl.createEl('h3', { text: 'General Chat Options' });

		// Auto-Attach Active Note
		new Setting(containerEl)
			.setName('Auto-Attach Active Note')
			.setDesc('Automatically link the active vault document and text selection to the chat context.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoAttachActiveNote)
				.onChange(async (value) => {
					this.plugin.settings.autoAttachActiveNote = value;
					await this.plugin.saveSettings();
				}));

		// Auto-Scroll Chat
		new Setting(containerEl)
			.setName('Auto-Scroll Chat')
			.setDesc('Automatically scroll to the bottom as the assistant streams responses.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoScrollChat)
				.onChange(async (value) => {
					this.plugin.settings.autoScrollChat = value;
					await this.plugin.saveSettings();
				}));

		// Show Status Bar Item
		new Setting(containerEl)
			.setName('Show Status Bar Item')
			.setDesc('Display the active AI provider, model, and reasoning effort in Obsidian\'s bottom status bar.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showStatusBarItem)
				.onChange(async (value) => {
					this.plugin.settings.showStatusBarItem = value;
					await this.plugin.saveSettings();
					this.plugin.updateStatusBar();
				}));

		// Reset Active Session
		new Setting(containerEl)
			.setName('Reset Conversation Memory')
			.setDesc(`Clear session history for ${provName} and start fresh on the next prompt.`)
			.addButton(button => button
				.setButtonText('Reset Active Session')
				.setWarning()
				.onClick(async () => {
					this.plugin.cliService.resetSession();
					button.setButtonText('Session Reset!');
					setTimeout(() => button.setButtonText('Reset Active Session'), 2000);
				}));
	}
}
