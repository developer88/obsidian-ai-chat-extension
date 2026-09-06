import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type AntigravityPlugin from './main';
import {
	AiProviderId,
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

		containerEl.createEl('p', {
			text: 'Connects directly to your local AI CLI binaries (Google Antigravity & GitHub Copilot) without API tokens.',
			cls: 'setting-item-description'
		});

		const activeProvId = this.plugin.settings.activeProvider || 'antigravity';
		const provConfig = this.plugin.settings.providers?.[activeProvId];

		// Active AI Provider Selector
		new Setting(containerEl)
			.setName('Active AI provider')
			.setDesc('Select which AI CLI provider powers your chat sessions.')
			.addDropdown(dropdown => {
				dropdown.addOption('antigravity', 'Google Antigravity (agy)');
				dropdown.addOption('copilot', 'GitHub Copilot (copilot)');
				dropdown.setValue(activeProvId);
				dropdown.onChange(async (value: string) => {
					this.plugin.settings.activeProvider = value as AiProviderId;
					await this.plugin.saveSettings();
					this.plugin.updateStatusBar();
					this.update();
				});
			});

		// Dynamic Model & Reasoning Effort Selector
		const models = provConfig?.cachedModels || [];
		const currentModelId = provConfig?.selectedModel || models[0]?.id || '';
		const currentModelObj = models.find(m => m.id === currentModelId || currentModelId.startsWith(m.id));
		const currentModelLabel = currentModelObj ? currentModelObj.label : (currentModelId || 'No model loaded');

		let currentEffortStr = '';
		if (currentModelObj && currentModelObj.efforts && currentModelObj.efforts.length > 1) {
			const effort = provConfig?.modelEfforts?.[currentModelObj.id] || currentModelObj.defaultEffort || 'Medium';
			currentEffortStr = ` (${effort} effort)`;
		}

		const provName = PROVIDER_METADATA[activeProvId]?.name || activeProvId;

		const modelSetting = new Setting(containerEl)
			.setName('Active model and reasoning effort')
			.setDesc(`Currently: ${currentModelLabel}${currentEffortStr}`);

		if (models.length > 0) {
			modelSetting.addButton(button => button
				.setButtonText('Select model and effort...')
				.setCta()
				.onClick(() => {
					new ModelSuggestModal(this.app, this.plugin).open();
				}));
		}

		modelSetting.addButton(button => button
			.setButtonText('Retrieve from CLI')
			.setTooltip('Query CLI dynamically for available models')
			.onClick(async () => {
				button.setButtonText('Querying...');
				button.setDisabled(true);
				const fetched = await this.plugin.cliService.fetchAvailableModels();
				if (fetched && fetched.length > 0) {
					new Notice(`Loaded ${fetched.length} models for ${provName}.`);
				} else {
					new Notice(`No models retrieved. Ensure "${provConfig?.cliCommand || provName}" is installed and working.`);
				}
				this.update();
			}));

		new Setting(containerEl)
			.setName(`${provName} Configuration`)
			.setHeading();

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

		// Vault and display options
		new Setting(containerEl)
			.setName('Vault integration and display')
			.setHeading();

		// Auto-Attach Active Note
		new Setting(containerEl)
			.setName('Auto-attach active note')
			.setDesc('Automatically link the active vault document and text selection to the chat context.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoAttachActiveNote)
				.onChange(async (value) => {
					this.plugin.settings.autoAttachActiveNote = value;
					await this.plugin.saveSettings();
				}));

		// Auto-Scroll Chat
		new Setting(containerEl)
			.setName('Auto-scroll chat')
			.setDesc('Automatically scroll to bottom as new response chunks arrive.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoScrollChat)
				.onChange(async (value) => {
					this.plugin.settings.autoScrollChat = value;
					await this.plugin.saveSettings();
				}));

		// Show Status Bar Item
		new Setting(containerEl)
			.setName('Show status bar item')
			.setDesc('Display current provider and model widget in the bottom status bar.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showStatusBarItem)
				.onChange(async (value) => {
					this.plugin.settings.showStatusBarItem = value;
					await this.plugin.saveSettings();
					this.plugin.updateStatusBar();
				}));

		// Reset Active Session
		new Setting(containerEl)
			.setName('Reset conversation memory')
			.setDesc(`Clear session history for ${provName} and start fresh on the next prompt.`)
			.addButton(button => button
				.setButtonText('Reset active session')
				.setDestructive()
				.onClick(() => {
					this.plugin.cliService.resetSession();
					button.setButtonText('Session reset!');
					window.setTimeout(() => {
						button.setButtonText('Reset active session');
					}, 2000);
				}));
	}
}
