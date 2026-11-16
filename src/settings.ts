import { App, PluginSettingTab, Setting, Notice, SettingDefinitionItem, SettingGroupItem, Platform, setIcon } from 'obsidian';
import type AntigravityPlugin from './main';
import {
	AiProviderId,
	PROVIDER_METADATA
} from './types';

const PROVIDER_IDS: AiProviderId[] = ['antigravity', 'copilot', 'pi', 'claude', 'codex'];

export class AntigravitySettingTab extends PluginSettingTab {
	plugin: AntigravityPlugin;
	private openCards = new Set<AiProviderId>();
	private refreshDebounceTimers = new Map<AiProviderId, number>();

	constructor(app: App, plugin: AntigravityPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private triggerDebouncedRefresh(provId: AiProviderId): void {
		const existing = this.refreshDebounceTimers.get(provId);
		if (existing !== undefined) {
			window.clearTimeout(existing);
		}
		const timer = window.setTimeout(() => {
			void this.plugin.cliService.refreshAllActiveProviders(provId);
		}, 600);
		this.refreshDebounceTimers.set(provId, timer);
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		const isWindows = (typeof Platform !== 'undefined' && Boolean(Platform?.isWin)) || (typeof process !== 'undefined' && process.platform === 'win32');

		const providerItems: SettingGroupItem[] = PROVIDER_IDS.map((provId) => {
			const provMeta = PROVIDER_METADATA[provId];
			const provName = provMeta?.name || provId;
			const defaultCmd = provMeta?.defaultCmd || provId;
			const defaultExtraFlags = provId === 'copilot'
				? '--allow-all-tools'
				: (provId === 'pi'
					? '--thinking high'
					: (provId === 'claude'
						? '--dangerously-skip-permissions'
						: (provId === 'codex'
							? '--dangerously-bypass-approvals-and-sandbox'
							: '--dangerously-skip-permissions')));

			return {
				name: provName,
				desc: `Configure ${provName} CLI path, flags, and model discovery.`,
				render: (setting: Setting) => {
					setting.settingEl.empty();
					setting.settingEl.addClass('agy-provider-setting-container');

					if (!this.plugin.settings.providers) {
						return;
					}
					const provConfig = this.plugin.settings.providers[provId];
					if (!provConfig) {
						return;
					}

					const isEnabled = Boolean(provConfig.enabled);
					const modelsCount = provConfig.cachedModels?.length ?? 0;

					const detailsEl = setting.settingEl.createEl('details', { cls: 'agy-provider-card' });
					if (this.openCards.has(provId)) {
						detailsEl.open = true;
					}

					detailsEl.addEventListener('toggle', () => {
						if (detailsEl.open) {
							this.openCards.add(provId);
						} else {
							this.openCards.delete(provId);
						}
					});

					const summaryEl = detailsEl.createEl('summary', { cls: 'agy-provider-summary' });

					const leftEl = summaryEl.createDiv({ cls: 'agy-provider-summary-left' });
					const chevronEl = leftEl.createSpan({ cls: 'agy-provider-chevron' });
					setIcon(chevronEl, 'chevron-right');
					leftEl.createSpan({ cls: 'agy-provider-summary-title', text: provName });

					const rightEl = summaryEl.createDiv({ cls: 'agy-provider-summary-right' });
					const modelCountEl = rightEl.createSpan({
						cls: 'agy-provider-summary-meta',
						text: `${modelsCount} model${modelsCount === 1 ? '' : 's'}`
					});
					const badgeEl = rightEl.createSpan({
						cls: `agy-provider-badge ${isEnabled ? 'is-enabled' : 'is-disabled'}`,
						text: isEnabled ? 'Enabled' : 'Disabled'
					});

					const bodyEl = detailsEl.createDiv({ cls: 'agy-provider-card-body' });

					// 1. Enable provider toggle
					new Setting(bodyEl)
						.setName('Enable provider')
						.setDesc(`Activate ${provName} for chat sessions and model selection.`)
						.addToggle(toggle => toggle
							.setValue(isEnabled)
							.onChange((val) => {
								void (async () => {
									provConfig.enabled = val;
									badgeEl.setText(val ? 'Enabled' : 'Disabled');
									badgeEl.className = `agy-provider-badge ${val ? 'is-enabled' : 'is-disabled'}`;

									if (val && !this.plugin.settings.providers[this.plugin.settings.activeProvider]?.enabled) {
										this.plugin.settings.activeProvider = provId;
									}

									await this.plugin.saveSettings();
									void this.plugin.cliService.refreshAllActiveProviders(provId);
								})();
							}));

					// 2. CLI command or path
					new Setting(bodyEl)
						.setName('CLI command or path')
						.setDesc(`The command or full path to the executable for ${provName} (e.g. "${defaultCmd}").`)
						.addText(text => text
							.setPlaceholder(defaultCmd)
							.setValue(provConfig.cliCommand || defaultCmd)
							.onChange((value) => {
								void (async () => {
									const trimmed = value.trim();
									if (/[;&|`$<>]/.test(trimmed)) {
										new Notice('Shell metacharacters (;, &, |, `, $, <, >) are not permitted for security.');
										provConfig.cliCommand = defaultCmd;
										text.setValue(defaultCmd);
									} else {
										provConfig.cliCommand = trimmed || defaultCmd;
									}
									await this.plugin.saveSettings();
									this.triggerDebouncedRefresh(provId);
								})();
							}));

					// 3. Run in WSL (Windows only)
					if (isWindows) {
						new Setting(bodyEl)
							.setName('Run in WSL')
							.setDesc(`Execute ${provName} via Windows Subsystem for Linux (e.g. "wsl ${defaultCmd}"). Enable if installed in Ubuntu/WSL.`)
							.addToggle(toggle => toggle
								.setValue(provConfig.useWsl || false)
								.onChange((value) => {
									void (async () => {
										provConfig.useWsl = value;
										await this.plugin.saveSettings();
										void this.plugin.cliService.refreshAllActiveProviders(provId);
									})();
								}));
					}

					// 4. Extra CLI flags
					new Setting(bodyEl)
						.setName('Extra CLI flags')
						.setDesc(`Additional flags passed to ${provName} on each invocation (e.g. "${defaultExtraFlags}").`)
						.addText(text => text
							.setPlaceholder(defaultExtraFlags)
							.setValue(provConfig.extraCliFlags || '')
							.onChange((value) => {
								void (async () => {
									provConfig.extraCliFlags = value.trim();
									await this.plugin.saveSettings();
									this.triggerDebouncedRefresh(provId);
								})();
							}));

					// 5. Model discovery & manual retrieve button
					new Setting(bodyEl)
						.setName('Discovered models')
						.setDesc(modelsCount > 0 ? `${modelsCount} models discovered and cached.` : 'No models cached yet.')
						.addButton(button => button
							.setButtonText('Retrieve from CLI')
							.setTooltip(`Query ${provName} CLI dynamically for available models`)
							.onClick(() => {
								void (async () => {
									button.setButtonText('Querying...');
									button.setDisabled(true);
									try {
										const res = await this.plugin.cliService.fetchAvailableModels(provId);
										if (res.success) {
											new Notice(`Loaded ${res.models.length} models for ${provName}.`);
											modelCountEl.setText(`${res.models.length} model${res.models.length === 1 ? '' : 's'}`);
										} else {
											const detail = res.error ? `: ${res.error}` : '';
											new Notice(`Could not retrieve models for ${provName}${detail}`);
										}
									} catch (err: unknown) {
										const msg = err instanceof Error ? err.message : String(err);
										new Notice(`Error retrieving models for ${provName}: ${msg}`);
									} finally {
										button.setButtonText('Retrieve from CLI');
										button.setDisabled(false);
										this.update();
									}
								})();
							}));
				}
			};
		});

		const definitions: SettingDefinitionItem[] = [
			{
				type: 'group',
				heading: 'AI providers',
				items: providerItems
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
						name: 'Enable context link attachment',
						desc: 'Allow attaching an additional context file or folder reference when sending prompts.',
						render: (setting: Setting) => {
							setting.setName('Enable context link attachment')
								.setDesc('Allow attaching an additional context file or folder reference when sending prompts.')
								.addToggle(toggle => toggle
									.setValue(this.plugin.settings.enableContextAttachment)
									.onChange((value) => {
										void (async () => {
											this.plugin.settings.enableContextAttachment = value;
											await this.plugin.saveSettings();
										})();
									}));
						}
					},
					{
						name: 'Attach context by default',
						desc: 'Automatically include the context reference when starting a new chat session.',
						render: (setting: Setting) => {
							setting.setName('Attach context by default')
								.setDesc('Automatically include the context reference when starting a new chat session.')
								.addToggle(toggle => toggle
									.setValue(this.plugin.settings.autoAttachContext)
									.onChange((value) => {
										void (async () => {
											this.plugin.settings.autoAttachContext = value;
											await this.plugin.saveSettings();
										})();
									}));
						}
					},
					{
						name: 'Context scope',
						desc: 'Choose whether to attach a single file or a whole folder.',
						render: (setting: Setting) => {
							setting.setName('Context scope')
								.setDesc('Choose whether to attach a single file or a whole folder.')
								.addDropdown(drop => drop
									.addOption('file', 'Single file')
									.addOption('folder', 'Whole folder')
									.setValue(this.plugin.settings.contextScope || 'file')
									.onChange((value: string) => {
										void (async () => {
											this.plugin.settings.contextScope = value as 'file' | 'folder';
											await this.plugin.saveSettings();
										})();
									}));
						}
					},
					{
						name: 'Context path',
						desc: 'Vault path to the context file or folder (e.g. "docs/context.md" or "notes/").',
						render: (setting: Setting) => {
							setting.setName('Context path')
								.setDesc('Vault path to the context file or folder (e.g. "docs/context.md" or "notes/").')
								.addText(text => text
									.setPlaceholder('docs/context.md')
									.setValue(this.plugin.settings.contextPath || '')
									.onChange((value) => {
										void (async () => {
											this.plugin.settings.contextPath = value.trim();
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
						name: 'Local process execution permission',
						desc: 'Acknowledge that Sidecar AI spawns local CLI processes (agy, copilot, pi, claude, codex) via child_process without API keys.',
						render: (setting: Setting) => {
							setting.setName('Local process execution permission')
								.setDesc('Acknowledge that Sidecar AI spawns local CLI processes (agy, copilot, pi, claude, codex) via child_process without API keys.')
								.addToggle(toggle => toggle
									.setValue(this.plugin.settings.hasAcceptedProcessExecutionDisclaimer ?? false)
									.onChange((value) => {
										void (async () => {
											this.plugin.settings.hasAcceptedProcessExecutionDisclaimer = value;
											await this.plugin.saveSettings();
										})();
									}));
						}
					}
				]
			},
			{
				type: 'group',
				heading: 'Support development',
				items: [
					{
						name: 'Buy me a coffee',
						desc: 'Support the ongoing development of this plugin with a coffee!',
						render: (setting: Setting) => {
							setting.setName('Buy me a coffee')
								.setDesc('Support the ongoing development of this plugin with a coffee!');
							const container = setting.controlEl.createDiv({ cls: 'agy-kofi-container' });
							const link = container.createEl('a', {
								cls: 'agy-kofi-link',
								href: 'https://ko-fi.com/O5K12AQJGT',
								attr: {
									target: '_blank',
									rel: 'noopener noreferrer',
									'aria-label': 'Buy Me a Coffee at ko-fi.com'
								}
							});
							link.createEl('img', {
								cls: 'agy-kofi-img',
								attr: {
									src: 'https://storage.ko-fi.com/cdn/kofi4.png?v=6',
									alt: 'Buy Me a Coffee at ko-fi.com',
									height: '36'
								}
							});
						}
					}
				]
			}
		];

		return definitions;
	}
}
