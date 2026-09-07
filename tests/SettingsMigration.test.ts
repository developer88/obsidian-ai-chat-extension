import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	DEFAULT_SETTINGS,
	DEFAULT_PROVIDER_CONFIGS,
	ANTIGRAVITY_MODELS,
	PI_DEFAULT_MODELS,
	AiChatPluginSettings,
	ProviderConfig,
	AiProviderId
} from '../src/types';

// Migration function mirroring the logic in AntigravityPlugin.prototype.loadSettings
function migrateSettings(rawData: Record<string, any> | null): AiChatPluginSettings {
	const settings: AiChatPluginSettings = {
		...DEFAULT_SETTINGS,
		providers: JSON.parse(JSON.stringify(DEFAULT_PROVIDER_CONFIGS)),
		...(rawData || {})
	};

	if (!settings.providers) {
		settings.providers = JSON.parse(JSON.stringify(DEFAULT_PROVIDER_CONFIGS)) as Record<AiProviderId, ProviderConfig>;
	} else {
		for (const provKey of Object.keys(DEFAULT_PROVIDER_CONFIGS) as AiProviderId[]) {
			if (!settings.providers[provKey]) {
				settings.providers[provKey] = JSON.parse(JSON.stringify(DEFAULT_PROVIDER_CONFIGS[provKey])) as ProviderConfig;
			}
		}
	}

	if (rawData?.cliCommand && settings.providers.antigravity) {
		settings.providers.antigravity.cliCommand = rawData.cliCommand;
	}
	if (rawData?.useWsl !== undefined && settings.providers.antigravity) {
		settings.providers.antigravity.useWsl = rawData.useWsl;
	}
	if (rawData?.selectedModel && settings.providers.antigravity) {
		settings.providers.antigravity.selectedModel = rawData.selectedModel;
	}
	if (rawData?.modelEfforts && settings.providers.antigravity) {
		settings.providers.antigravity.modelEfforts = Object.assign(
			{},
			settings.providers.antigravity.modelEfforts,
			rawData.modelEfforts
		);
	}
	if (rawData?.cachedModels && settings.providers.antigravity) {
		settings.providers.antigravity.cachedModels = rawData.cachedModels;
	}
	if (rawData?.extraCliFlags && settings.providers.antigravity) {
		settings.providers.antigravity.extraCliFlags = rawData.extraCliFlags;
	}
	if (rawData?.defaultMode && settings.providers.antigravity) {
		settings.providers.antigravity.defaultMode = rawData.defaultMode;
	}
	if (rawData?.conversationId && settings.providers.antigravity) {
		settings.providers.antigravity.conversationId = rawData.conversationId;
	}

	return settings;
}

describe('Settings & Migration', () => {
	test('initializes default settings with all providers', () => {
		const settings = migrateSettings(null);
		assert.equal(settings.activeProvider, 'antigravity');
		assert.ok(settings.providers.antigravity);
		assert.ok(settings.providers.copilot);
		assert.ok(settings.providers.pi);

		assert.equal(settings.providers.antigravity.selectedModel, 'gemini-3.8-flash');
		assert.equal(settings.providers.pi.selectedModel, 'github-copilot/claude-sonnet-4.5');
		assert.equal(settings.providers.pi.modelEfforts['github-copilot/claude-sonnet-4.5'], 'High');
	});

	test('migrates legacy single-provider settings to antigravity provider config', () => {
		const legacyData = {
			activeProvider: 'antigravity',
			cliCommand: '/custom/bin/agy',
			useWsl: true,
			selectedModel: 'gemini-3.1-pro',
			modelEfforts: { 'gemini-3.1-pro': 'High' },
			extraCliFlags: '--verbose',
			conversationId: 'legacy-conv-999'
		};

		const migrated = migrateSettings(legacyData);
		assert.equal(migrated.providers.antigravity.cliCommand, '/custom/bin/agy');
		assert.equal(migrated.providers.antigravity.useWsl, true);
		assert.equal(migrated.providers.antigravity.selectedModel, 'gemini-3.1-pro');
		assert.equal(migrated.providers.antigravity.modelEfforts['gemini-3.1-pro'], 'High');
		assert.equal(migrated.providers.antigravity.extraCliFlags, '--verbose');
		assert.equal(migrated.providers.antigravity.conversationId, 'legacy-conv-999');

		// Ensure copilot and pi were also populated with defaults
		assert.ok(migrated.providers.copilot);
		assert.ok(migrated.providers.pi);
		assert.equal(migrated.providers.pi.cliCommand, 'pi');
	});

	test('preserves existing multi-provider configurations and fills missing providers', () => {
		const existingData = {
			activeProvider: 'pi' as AiProviderId,
			providers: {
				pi: {
					id: 'pi' as AiProviderId,
					name: 'Pi Coding Agent',
					cliCommand: '/opt/homebrew/bin/pi',
					useWsl: false,
					extraCliFlags: '',
					selectedModel: 'github-copilot/gpt-4o',
					modelEfforts: {},
					cachedModels: PI_DEFAULT_MODELS,
					defaultMode: '',
					conversationId: 'pi-123'
				}
			}
		};

		const settings = migrateSettings(existingData);
		assert.equal(settings.activeProvider, 'pi');
		assert.equal(settings.providers.pi.cliCommand, '/opt/homebrew/bin/pi');
		assert.equal(settings.providers.pi.selectedModel, 'github-copilot/gpt-4o');
		assert.equal(settings.providers.pi.conversationId, 'pi-123');

		// Antigravity and Copilot should be added from defaults
		assert.ok(settings.providers.antigravity);
		assert.ok(settings.providers.copilot);
		assert.equal(settings.providers.antigravity.cliCommand, 'agy');
	});
});
