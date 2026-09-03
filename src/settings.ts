import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type AntigravityPlugin from './main';
import { ANTIGRAVITY_2_MODELS } from './types';

export class AntigravitySettingTab extends PluginSettingTab {
	plugin: AntigravityPlugin;

	constructor(app: App, plugin: AntigravityPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Antigravity AI Settings' });
		containerEl.createEl('p', {
			text: 'Connects directly to your local Antigravity CLI (agy) using your Google AI subscription without an API token.',
			cls: 'setting-item-description'
		});

		const models = this.plugin.settings.cachedModels && this.plugin.settings.cachedModels.length > 0
			? this.plugin.settings.cachedModels
			: ANTIGRAVITY_2_MODELS;

		// Model Selection
		new Setting(containerEl)
			.setName('AI Model')
			.setDesc('Select the model to use for chat sessions.')
			.addDropdown(dropdown => {
				for (const model of models) {
					dropdown.addOption(model.id, model.label);
				}
				dropdown.setValue(this.plugin.settings.selectedModel || models[0].id);
				dropdown.onChange(async (value) => {
					this.plugin.settings.selectedModel = value;
					await this.plugin.saveSettings();
					this.display(); // Re-render to update model-specific effort
				});
			})
			.addButton(button => button
				.setButtonText('Refresh from CLI')
				.setTooltip('Query `agy models` to update the model list')
				.onClick(async () => {
					button.setButtonText('Querying...');
					button.setDisabled(true);
					const fetched = await this.plugin.cliService.fetchAvailableModels();
					new Notice(`Loaded ${fetched.length} models.`);
					this.display();
				}));

		// Current Model Effort Setting
		const currentModelId = this.plugin.settings.selectedModel || models[0].id;
		const currentModelObj = models.find(m => m.id === currentModelId);

		if (currentModelObj && currentModelObj.efforts && currentModelObj.efforts.length > 0) {
			new Setting(containerEl)
				.setName(`Reasoning Effort for ${currentModelObj.label}`)
				.setDesc('Select the reasoning effort level (Low, Medium, High) for this model.')
				.addDropdown(dropdown => {
					for (const effort of currentModelObj.efforts) {
						dropdown.addOption(effort, effort);
					}
					const saved = this.plugin.settings.modelEfforts?.[currentModelId]
						|| currentModelObj.defaultEffort
						|| currentModelObj.efforts[0];
					dropdown.setValue(saved);
					dropdown.onChange(async (value) => {
						if (!this.plugin.settings.modelEfforts) {
							this.plugin.settings.modelEfforts = {};
						}
						this.plugin.settings.modelEfforts[currentModelId] = value;
						await this.plugin.saveSettings();
					});
				});
		}

		// CLI Command / Path
		new Setting(containerEl)
			.setName('Antigravity CLI Command / Path')
			.setDesc('The command or full path to the agy executable (e.g. "agy", "/usr/local/bin/agy", or "agy.cmd").')
			.addText(text => text
				.setPlaceholder('agy')
				.setValue(this.plugin.settings.cliCommand)
				.onChange(async (value) => {
					this.plugin.settings.cliCommand = value.trim() || 'agy';
					await this.plugin.saveSettings();
				}));

		// Use WSL
		new Setting(containerEl)
			.setName('Use WSL (Windows Subsystem for Linux)')
			.setDesc('Enable if your Antigravity CLI is installed inside WSL (executes via "wsl agy").')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useWsl)
				.onChange(async (value) => {
					this.plugin.settings.useWsl = value;
					await this.plugin.saveSettings();
				}));

		// Auto-Attach Active Note
		new Setting(containerEl)
			.setName('Auto-Attach Active Note')
			.setDesc('Automatically include the currently opened note in the chat context.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoAttachActiveNote)
				.onChange(async (value) => {
					this.plugin.settings.autoAttachActiveNote = value;
					await this.plugin.saveSettings();
				}));

		// Default Execution Mode
		new Setting(containerEl)
			.setName('Default Execution Mode')
			.setDesc('Optional mode passed to the CLI (e.g. "plan", "fast", or leave blank for default).')
			.addText(text => text
				.setPlaceholder('default')
				.setValue(this.plugin.settings.defaultMode)
				.onChange(async (value) => {
					this.plugin.settings.defaultMode = value.trim();
					await this.plugin.saveSettings();
				}));

		// Extra Flags
		new Setting(containerEl)
			.setName('Extra CLI Flags')
			.setDesc('Additional CLI flags to pass on each invocation (e.g. "--dangerously-skip-permissions").')
			.addText(text => text
				.setPlaceholder('--dangerously-skip-permissions')
				.setValue(this.plugin.settings.extraCliFlags)
				.onChange(async (value) => {
					this.plugin.settings.extraCliFlags = value.trim();
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

		// Reset Session
		new Setting(containerEl)
			.setName('Reset Conversation Memory')
			.setDesc('Forget active session history and start fresh on the next prompt.')
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


