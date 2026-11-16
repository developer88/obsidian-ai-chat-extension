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
	availableEfforts?: string[];
	isActive: boolean;
}

export class ModelSuggestModal extends FuzzySuggestModal<ModelChoiceItem> {
	constructor(app: App, private plugin: AntigravityPlugin) {
		super(app);
		this.setPlaceholder('Search provider and model...');
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
				const currentEffort = provConfig.modelEfforts?.[model.id] || model.defaultEffort;
				const isThisActive = (provId === activeProvId && model.id === currentActiveModelId);
				items.push({
					providerId: provId,
					providerName: provName,
					modelId: model.id,
					modelLabel: model.label,
					effort: currentEffort,
					availableEfforts: model.efforts,
					isActive: isThisActive
				});
			}
		}

		if (items.length === 0) {
			this.setPlaceholder('No providers enabled. Enable at least one provider in settings.');
		} else {
			this.setPlaceholder('Search provider and model...');
		}

		return items;
	}

	getItemText(item: ModelChoiceItem): string {
		const effortPart = item.effort ? ` (${item.effort})` : '';
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
		if (item.availableEfforts && item.availableEfforts.length > 1) {
			new EffortSuggestModal(
				this.app,
				this.plugin,
				item.providerId,
				item.providerName,
				item.modelId,
				item.modelLabel,
				item.availableEfforts,
				item.effort
			).open();
		} else {
			void this.plugin.switchProviderAndModel(item.providerId, item.modelId, item.effort);
		}
	}
}

export interface EffortChoiceItem {
	effort: string;
	isCurrent: boolean;
}

export class EffortSuggestModal extends FuzzySuggestModal<EffortChoiceItem> {
	constructor(
		app: App,
		private plugin: AntigravityPlugin,
		private providerId: AiProviderId,
		private providerName: string,
		private modelId: string,
		private modelLabel: string,
		private efforts: string[],
		private currentEffort?: string
	) {
		super(app);
		this.setPlaceholder(`Select reasoning effort for ${modelLabel}...`);
	}

	getItems(): EffortChoiceItem[] {
		return this.efforts.map(eff => ({
			effort: eff,
			isCurrent: Boolean(this.currentEffort && eff.toLowerCase() === this.currentEffort.toLowerCase())
		}));
	}

	getItemText(item: EffortChoiceItem): string {
		const currentSuffix = item.isCurrent ? ' (Current)' : '';
		return `${item.effort}${currentSuffix}`;
	}

	renderSuggestion(match: FuzzyMatch<EffortChoiceItem>, el: HTMLElement): void {
		el.addClass('agy-modal-suggestion-item');
		const textContainer = el.createDiv({ cls: 'agy-modal-suggestion-text' });
		const titleEl = textContainer.createSpan({ cls: 'agy-modal-suggestion-title' });
		super.renderSuggestion(match, titleEl);

		if (match.item.isCurrent) {
			el.createSpan({
				cls: 'agy-modal-active-badge',
				text: 'Current'
			});
		}
	}

	onChooseItem(item: EffortChoiceItem): void {
		void this.plugin.switchProviderAndModel(this.providerId, this.modelId, item.effort);
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
