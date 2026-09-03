import { App, FuzzySuggestModal, FuzzyMatch } from 'obsidian';
import { ModelDefinition, ANTIGRAVITY_2_MODELS } from '../types';
import AntigravityPlugin from '../main';

export interface ModelChoiceItem {
	modelId: string;
	modelLabel: string;
	effort?: string;
	isActive: boolean;
}

export class ModelSuggestModal extends FuzzySuggestModal<ModelChoiceItem> {
	constructor(app: App, private plugin: AntigravityPlugin) {
		super(app);
		this.setPlaceholder('Search Antigravity models and reasoning effort...');
	}

	getItems(): ModelChoiceItem[] {
		const settings = this.plugin.settings;
		const models = (settings.cachedModels && settings.cachedModels.length > 0)
			? settings.cachedModels
			: ANTIGRAVITY_2_MODELS;

		const currentModelId = settings.selectedModel;
		const items: ModelChoiceItem[] = [];

		for (const model of models) {
			if (model.efforts && model.efforts.length > 1) {
				const currentEffort = settings.modelEfforts?.[model.id] || model.defaultEffort || 'Medium';
				for (const effort of model.efforts) {
					const isThisActive = (model.id === currentModelId && effort.toLowerCase() === currentEffort.toLowerCase());
					items.push({
						modelId: model.id,
						modelLabel: model.label,
						effort: effort,
						isActive: isThisActive
					});
				}
			} else {
				const singleEffort = model.efforts && model.efforts.length === 1 ? model.efforts[0] : undefined;
				const isThisActive = (model.id === currentModelId);
				items.push({
					modelId: model.id,
					modelLabel: model.label,
					effort: singleEffort,
					isActive: isThisActive
				});
			}
		}

		return items;
	}

	getItemText(item: ModelChoiceItem): string {
		if (item.effort) {
			return `${item.modelLabel} (${item.effort} effort)`;
		}
		return item.modelLabel;
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

	async onChooseItem(item: ModelChoiceItem): Promise<void> {
		await this.plugin.switchModel(item.modelId, item.effort);
	}
}
