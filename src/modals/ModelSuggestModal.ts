import { App, FuzzySuggestModal, FuzzyMatch, Modal, Setting } from 'obsidian';
import {
	AiProviderId,
	PROVIDER_METADATA
} from '../types';
import AntigravityPlugin from '../main';

export interface ModelChoiceItem {
	providerId: AiProviderId;
	providerName: string;
	modelId: string;
	modelLabel: string;
	effort?: string;
	isActive: boolean;
}

export class ModelSuggestModal extends FuzzySuggestModal<ModelChoiceItem> {
	constructor(app: App, private plugin: AntigravityPlugin) {
		super(app);
		this.setPlaceholder('Search models and reasoning effort...');
	}

	getItems(): ModelChoiceItem[] {
		const settings = this.plugin.settings;
		const activeProvId = settings.activeProvider || 'antigravity';
		const activeProvConfig = settings.providers?.[activeProvId];
		const currentActiveModelId = activeProvConfig?.selectedModel || '';
		const items: ModelChoiceItem[] = [];

		const providerIds: AiProviderId[] = ['antigravity', 'copilot', 'pi', 'claude', 'codex'];

		for (const provId of providerIds) {
			const provConfig = settings.providers?.[provId];
			if (!provConfig || !provConfig.enabled) {
				continue;
			}

			const provName = PROVIDER_METADATA[provId]?.name || provId;
			const models = provConfig.cachedModels || [];

			for (const model of models) {
				if (model.efforts && model.efforts.length > 1) {
					const currentEffort = provConfig.modelEfforts?.[model.id] || model.defaultEffort || 'Medium';
					for (const effort of model.efforts) {
						const isThisActive = (provId === activeProvId && model.id === currentActiveModelId && effort.toLowerCase() === currentEffort.toLowerCase());
						items.push({
							providerId: provId,
							providerName: provName,
							modelId: model.id,
							modelLabel: model.label,
							effort: effort,
							isActive: isThisActive
						});
					}
				} else {
					const singleEffort = model.efforts && model.efforts.length === 1 ? model.efforts[0] : undefined;
					const isThisActive = (provId === activeProvId && model.id === currentActiveModelId);
					items.push({
						providerId: provId,
						providerName: provName,
						modelId: model.id,
						modelLabel: model.label,
						effort: singleEffort,
						isActive: isThisActive
					});
				}
			}
		}

		if (items.length === 0) {
			this.setPlaceholder('No providers enabled. Enable at least one provider in settings.');
		} else {
			this.setPlaceholder('Search provider - model and reasoning effort...');
		}

		return items;
	}

	getItemText(item: ModelChoiceItem): string {
		const effortPart = item.effort ? ` (${item.effort} effort)` : '';
		return `${item.providerName} - ${item.modelLabel}${effortPart}`;
	}

	renderSuggestion(match: FuzzyMatch<ModelChoiceItem>, el: HTMLElement): void {
		el.addClass('agy-modal-suggestion-item');

		const textContainer = el.createDiv({ cls: 'agy-modal-suggestion-text' });
		const titleEl = textContainer.createSpan({ cls: 'agy-modal-suggestion-title' });
		super.renderSuggestion(match, titleEl);

		if (match.item.isActive) {
			el.createSpan({
				cls: 'agy-modal-active-badge',
				text: 'Active'
			});
		}
	}

	onChooseItem(item: ModelChoiceItem): void {
		void this.plugin.switchProviderAndModel(item.providerId, item.modelId, item.effort);
	}
}

export class ProcessExecutionNoticeModal extends Modal {
	constructor(app: App, private onConfirm: () => void) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('agy-security-modal');

		contentEl.createEl('h3', { text: 'Sidecar AI: Local CLI Execution' });

		contentEl.createEl('p', {
			text: 'Sidecar AI connects Obsidian directly to your locally installed AI CLI tools (Google Antigravity, GitHub Copilot, Pi Coding Agent, Claude Code, or OpenAI Codex) via child_process.spawn without remote API keys.'
		});

		const list = contentEl.createEl('ul');
		list.createEl('li', {
			text: 'Shell execution is strictly disabled (shell: false) to prevent command injection.'
		});
		list.createEl('li', {
			text: 'Commands are executed solely on your machine under your user account when sending prompts or querying models.'
		});
		list.createEl('li', {
			text: 'Clipboard access is strictly write-only for the code copy button.'
		});

		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText('Acknowledge and proceed')
					.setCta()
					.onClick(() => {
						this.close();
						this.onConfirm();
					});
			});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
