import { App, FuzzySuggestModal, FuzzyMatch } from 'obsidian';
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
		const provConfig = settings.providers?.[activeProvId];
		const provName = PROVIDER_METADATA[activeProvId]?.name || activeProvId;
		const items: ModelChoiceItem[] = [];

		const models = provConfig?.cachedModels || [];
		const currentModelId = provConfig?.selectedModel || models[0]?.id || '';

		for (const model of models) {
			if (model.efforts && model.efforts.length > 1) {
				const currentEffort = provConfig?.modelEfforts?.[model.id] || model.defaultEffort || 'Medium';
				for (const effort of model.efforts) {
					const isThisActive = (model.id === currentModelId && effort.toLowerCase() === currentEffort.toLowerCase());
					items.push({
						providerId: activeProvId,
						providerName: provName,
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
					providerId: activeProvId,
					providerName: provName,
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
		const effortPart = item.effort ? ` (${item.effort} effort)` : '';
		return `${item.modelLabel}${effortPart}`;
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
		void this.plugin.switchModelForActiveProvider(item.modelId, item.effort);
	}
}
