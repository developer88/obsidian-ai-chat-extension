import { App, FuzzySuggestModal, FuzzyMatch } from 'obsidian';
import {
	ModelDefinition,
	AiProviderId,
	ANTIGRAVITY_MODELS,
	COPILOT_MODELS,
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
		this.setPlaceholder('Search models, providers (Antigravity, Copilot), or effort...');
	}

	getItems(): ModelChoiceItem[] {
		const settings = this.plugin.settings;
		const activeProvider = settings.activeProvider || 'antigravity';
		const items: ModelChoiceItem[] = [];

		const providersList: AiProviderId[] = ['antigravity', 'copilot'];

		for (const provId of providersList) {
			const provConfig = settings.providers?.[provId];
			const provName = PROVIDER_METADATA[provId]?.name || provId;
			const isProvActive = (provId === activeProvider);

			const models = (provConfig?.cachedModels && provConfig.cachedModels.length > 0)
				? provConfig.cachedModels
				: (provId === 'copilot' ? COPILOT_MODELS : ANTIGRAVITY_MODELS);

			const currentModelId = provConfig?.selectedModel || (models[0]?.id ?? '');

			for (const model of models) {
				if (model.efforts && model.efforts.length > 1) {
					const currentEffort = provConfig?.modelEfforts?.[model.id] || model.defaultEffort || 'Medium';
					for (const effort of model.efforts) {
						const isThisActive = isProvActive && (model.id === currentModelId && effort.toLowerCase() === currentEffort.toLowerCase());
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
					const isThisActive = isProvActive && (model.id === currentModelId);
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

		return items;
	}

	getItemText(item: ModelChoiceItem): string {
		const effortPart = item.effort ? ` (${item.effort})` : '';
		return `${item.providerName} • ${item.modelLabel}${effortPart}`;
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
		await this.plugin.switchProviderAndModel(item.providerId, item.modelId, item.effort);
	}
}
