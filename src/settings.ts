import { App, PluginSettingTab, Setting, Notice, SettingDefinitionItem } from 'obsidian';
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

	override getSettingDefinitions(): SettingDefinitionItem[] {
		const activeProvId = this.plugin.settings.activeProvider || 'antigravity';
		const provConfig = this.plugin.settings.providers?.[activeProvId];
		const provName = PROVIDER_METADATA[activeProvId]?.name || activeProvId;
		const defaultCmd = PROVIDER_METADATA[activeProvId]?.defaultCmd || 'agy';
		const defaultExtraFlags = activeProvId === 'copilot'
			? '--allow-all-tools'
			: (activeProvId === 'pi' ? '--thinking high' : '--dangerously-skip-permissions');

		const models = provConfig?.cachedModels || [];
		const currentModelId = provConfig?.selectedModel || models[0]?.id || '';
		const currentModelObj = models.find(m => m.id === currentModelId || currentModelId.startsWith(m.id));
		const currentModelLabel = currentModelObj ? currentModelObj.label : (currentModelId || 'No model loaded');

		let currentEffortStr = '';
		if (currentModelObj && currentModelObj.efforts && currentModelObj.efforts.length > 1) {
			const effort = provConfig?.modelEfforts?.[currentModelObj.id] || currentModelObj.defaultEffort || 'Medium';
			currentEffortStr = ` (${effort} effort)`;
		}

		return [
			{
				name: 'Active AI provider',
				desc: 'Select which AI CLI provider powers your chat sessions.',
				render: (setting: Setting) => {
					setting.setName('Active AI provider')
						.setDesc('Select which AI CLI provider powers your chat sessions.')
						.addDropdown(dropdown => {
							dropdown.selectEl.addClass('agy-provider-dropdown');
							dropdown.selectEl.setCssStyles({
								height: 'auto',
								minHeight: '32px',
								lineHeight: '1.4',
								paddingTop: '4px',
								paddingBottom: '5px'
							});
							dropdown.addOption('antigravity', 'Google Antigravity (agy)');
							dropdown.addOption('copilot', 'GitHub Copilot (copilot)');
							dropdown.addOption('pi', 'Pi Coding Agent (pi)');
							dropdown.setValue(activeProvId);
							dropdown.onChange((value: string) => {
								void (async () => {
									this.plugin.settings.activeProvider = value as AiProviderId;
									await this.plugin.saveSettings();
									this.plugin.updateStatusBar();
									this.update();
								})();
							});
						});
				}
			},
			{
				name: 'Active model and reasoning effort',
				desc: `Currently: ${currentModelLabel}${currentEffortStr}`,
				render: (setting: Setting) => {
					setting.setName('Active model and reasoning effort')
						.setDesc(`Currently: ${currentModelLabel}${currentEffortStr}`);

					if (models.length > 0) {
						setting.addButton(button => button
							.setButtonText('Select model and effort...')
							.setCta()
							.onClick(() => {
								new ModelSuggestModal(this.app, this.plugin).open();
							}));
					}

					setting.addButton(button => button
						.setButtonText('Retrieve from CLI')
						.setTooltip('Query CLI dynamically for available models')
						.onClick(() => {
							void (async () => {
								button.setButtonText('Querying...');
								button.setDisabled(true);
								const fetched = await this.plugin.cliService.fetchAvailableModels();
								if (fetched && fetched.length > 0) {
									new Notice(`Loaded ${fetched.length} models for ${provName}.`);
								} else {
									new Notice(`No models retrieved. Ensure "${provConfig?.cliCommand || provName}" is installed and working.`);
								}
								this.update();
							})();
						}));
				}
			},
			{
				type: 'group',
				heading: 'CLI configuration',
				items: [
					{
						name: 'CLI command or path',
						desc: `The command or full path to the executable for ${provName} (e.g. "${defaultCmd}").`,
						render: (setting: Setting) => {
							setting.setName('CLI command or path')
								.setDesc(`The command or full path to the executable for ${provName} (e.g. "${defaultCmd}").`)
								.addText(text => text
									.setPlaceholder(defaultCmd)
									.setValue(provConfig?.cliCommand || defaultCmd)
									.onChange((value) => {
										void (async () => {
											if (provConfig) {
												provConfig.cliCommand = value.trim() || defaultCmd;
												await this.plugin.saveSettings();
											}
										})();
									}));
						}
					},
					{
						name: 'Run in WSL',
						desc: `Execute ${provName} via Windows Subsystem for Linux (e.g. "wsl ${defaultCmd}"). Enable if installed in Ubuntu/WSL.`,
						render: (setting: Setting) => {
							setting.setName('Run in WSL')
								.setDesc(`Execute ${provName} via Windows Subsystem for Linux (e.g. "wsl ${defaultCmd}"). Enable if installed in Ubuntu/WSL.`)
								.addToggle(toggle => toggle
									.setValue(provConfig?.useWsl || false)
									.onChange((value) => {
										void (async () => {
											if (provConfig) {
												provConfig.useWsl = value;
												await this.plugin.saveSettings();
											}
										})();
									}));
						}
					},
					{
						name: 'Extra CLI flags',
						desc: `Additional flags passed to ${provName} on each invocation (e.g. "${defaultExtraFlags}").`,
						render: (setting: Setting) => {
							setting.setName('Extra CLI flags')
								.setDesc(`Additional flags passed to ${provName} on each invocation (e.g. "${defaultExtraFlags}").`)
								.addText(text => text
									.setPlaceholder(defaultExtraFlags)
									.setValue(provConfig?.extraCliFlags || '')
									.onChange((value) => {
										void (async () => {
											if (provConfig) {
												provConfig.extraCliFlags = value.trim();
												await this.plugin.saveSettings();
											}
										})();
									}));
						}
					}
				]
			},
			{
				type: 'group',
				heading: 'Vault integration and display',
				items: [
					{
						name: 'Auto-attach active note',
						desc: 'Automatically link the active vault document and text selection to the chat context.',
						render: (setting: Setting) => {
							setting.setName('Auto-attach active note')
								.setDesc('Automatically link the active vault document and text selection to the chat context.')
								.addToggle(toggle => toggle
									.setValue(this.plugin.settings.autoAttachActiveNote)
									.onChange((value) => {
										void (async () => {
											this.plugin.settings.autoAttachActiveNote = value;
											await this.plugin.saveSettings();
										})();
									}));
						}
					},
					{
						name: 'Auto-scroll chat',
						desc: 'Automatically scroll to bottom as new response chunks arrive.',
						render: (setting: Setting) => {
							setting.setName('Auto-scroll chat')
								.setDesc('Automatically scroll to bottom as new response chunks arrive.')
								.addToggle(toggle => toggle
									.setValue(this.plugin.settings.autoScrollChat)
									.onChange((value) => {
										void (async () => {
											this.plugin.settings.autoScrollChat = value;
											await this.plugin.saveSettings();
										})();
									}));
						}
					},
					{
						name: 'Show status bar item',
						desc: 'Display current provider and model widget in the bottom status bar.',
						render: (setting: Setting) => {
							setting.setName('Show status bar item')
								.setDesc('Display current provider and model widget in the bottom status bar.')
								.addToggle(toggle => toggle
									.setValue(this.plugin.settings.showStatusBarItem)
									.onChange((value) => {
										void (async () => {
											this.plugin.settings.showStatusBarItem = value;
											await this.plugin.saveSettings();
											this.plugin.updateStatusBar();
										})();
									}));
						}
					},
					{
						name: 'Reset conversation memory',
						desc: `Clear session history for ${provName} and start fresh on the next prompt.`,
						render: (setting: Setting) => {
							setting.setName('Reset conversation memory')
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
				]
			}
		];
	}
}

