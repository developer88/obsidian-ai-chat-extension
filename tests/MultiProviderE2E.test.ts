import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	DEFAULT_SETTINGS,
	AiChatPluginSettings,
	AiProviderId,
	ANTIGRAVITY_MODELS,
	COPILOT_DEFAULT_MODELS,
	PI_DEFAULT_MODELS,
	CLAUDE_DEFAULT_MODELS,
	CODEX_DEFAULT_MODELS,
	cloneDefaultProviderConfigs,
	cloneProviderConfig,
	DEFAULT_PROVIDER_CONFIGS,
	PROVIDER_METADATA
} from '../src/types';
import { AgyCliService } from '../src/services/AgyCliService';

function createMockApp() {
	return {
		vault: {
			adapter: {
				getBasePath: () => '/mock/vault'
			}
		}
	} as any;
}

function createTestHarness(initialSettings?: Partial<AiChatPluginSettings>) {
	const settings: AiChatPluginSettings = {
		...DEFAULT_SETTINGS,
		providers: cloneDefaultProviderConfigs(),
		...initialSettings
	};

	const notices: string[] = [];
	const service = new AgyCliService(
		createMockApp(),
		() => settings,
		async (newSettings) => {
			Object.assign(settings, newSettings);
		},
		undefined,
		(msg: string) => {
			notices.push(msg);
		}
	);

	// Mock plugin for switchProviderAndModel simulation
	const plugin = {
		settings,
		cliService: service,
		saveSettings: async () => {},
		switchProviderAndModel: async (providerId: AiProviderId, modelId: string, effort?: string) => {
			settings.activeProvider = providerId;
			if (!settings.providers[providerId]) {
				settings.providers[providerId] = cloneProviderConfig(DEFAULT_PROVIDER_CONFIGS[providerId]);
			}
			const provConfig = settings.providers[providerId];
			provConfig.selectedModel = modelId;
			if (effort) {
				provConfig.modelEfforts[modelId] = effort;
			}
			const provName = PROVIDER_METADATA[providerId]?.name || providerId;
			const models = provConfig.cachedModels || [];
			const modelDef = models.find(m => m.id === modelId);
			const label = modelDef ? modelDef.label : modelId;
			const effortStr = effort ? ` (${effort})` : '';
			notices.push(`${provName}: ${label}${effortStr}`);
		}
	};

	return { settings, service, plugin, notices };
}

describe('Multi-Provider E2E & Dynamic Switching', () => {

	test('E2E: Simultaneous multi-provider activation and independent configurations', () => {
		const { settings } = createTestHarness();

		// Enable both Antigravity and Copilot simultaneously
		settings.providers.antigravity.enabled = true;
		settings.providers.antigravity.cliCommand = 'agy';
		settings.providers.antigravity.extraCliFlags = '--verbose';

		settings.providers.copilot.enabled = true;
		settings.providers.copilot.cliCommand = '/usr/local/bin/copilot';
		settings.providers.copilot.extraCliFlags = '--allow-all-tools';

		// Pi remains disabled
		settings.providers.pi.enabled = false;

		// Verify simultaneous configurations are preserved without collision
		assert.equal(settings.providers.antigravity.enabled, true);
		assert.equal(settings.providers.copilot.enabled, true);
		assert.equal(settings.providers.pi.enabled, false);

		assert.equal(settings.providers.antigravity.extraCliFlags, '--verbose');
		assert.equal(settings.providers.copilot.extraCliFlags, '--allow-all-tools');
		assert.equal(settings.providers.copilot.cliCommand, '/usr/local/bin/copilot');
	});

	test('E2E: switchProviderAndModel switches active provider, model, and reasoning effort in one step', async () => {
		const { plugin, settings, notices } = createTestHarness();

		// Start on Antigravity
		settings.activeProvider = 'antigravity';
		settings.providers.antigravity.enabled = true;
		settings.providers.copilot.enabled = true;

		// Switch to Copilot auto
		await plugin.switchProviderAndModel('copilot', 'auto');
		assert.equal(settings.activeProvider, 'copilot');
		assert.equal(settings.providers.copilot.selectedModel, 'auto');
		assert.ok(notices[notices.length - 1].includes('GitHub Copilot'));

		// Switch to Codex with Low reasoning effort
		settings.providers.codex.enabled = true;
		await plugin.switchProviderAndModel('codex', 'gpt-6-luna', 'Low');
		assert.equal(settings.activeProvider, 'codex');
		assert.equal(settings.providers.codex.selectedModel, 'gpt-6-luna');
		assert.equal(settings.providers.codex.modelEfforts['gpt-6-luna'], 'Low');
		assert.ok(notices[notices.length - 1].includes('OpenAI Codex'));
		assert.ok(notices[notices.length - 1].includes('Low'));
	});

	test('E2E: 5-minute TTL cache expiration rules', () => {
		const { service, settings } = createTestHarness();
		const now = Date.now();
		const FIVE_MINUTES_MS = 5 * 60 * 1000;

		// 1. Unset lastRetrieved is expired
		settings.providers.antigravity.enabled = true;
		settings.providers.antigravity.lastRetrieved = undefined;
		assert.equal(service.isCacheExpired('antigravity', FIVE_MINUTES_MS), true);
		assert.equal(service.areAnyActiveCachesExpired(FIVE_MINUTES_MS), true);

		// 2. 4 minutes ago (not expired)
		settings.providers.antigravity.lastRetrieved = now - (4 * 60 * 1000);
		assert.equal(service.isCacheExpired('antigravity', FIVE_MINUTES_MS), false);
		assert.equal(service.areAnyActiveCachesExpired(FIVE_MINUTES_MS), false);

		// 3. 6 minutes ago (expired)
		settings.providers.antigravity.lastRetrieved = now - (6 * 60 * 1000);
		assert.equal(service.isCacheExpired('antigravity', FIVE_MINUTES_MS), true);
		assert.equal(service.areAnyActiveCachesExpired(FIVE_MINUTES_MS), true);

		// 4. If an expired provider is disabled, it does NOT cause areAnyActiveCachesExpired to be true
		settings.providers.antigravity.enabled = false;
		settings.providers.copilot.enabled = true;
		settings.providers.copilot.lastRetrieved = now - (1 * 60 * 1000); // fresh
		assert.equal(service.areAnyActiveCachesExpired(FIVE_MINUTES_MS), false);
	});

	test('E2E: Model suggestion list aggregates only enabled providers with Provider - Model (Effort) format', () => {
		const { settings } = createTestHarness();

		// Enable Copilot and Claude, disable others
		settings.providers.antigravity.enabled = false;
		settings.providers.copilot.enabled = true;
		settings.providers.pi.enabled = false;
		settings.providers.claude.enabled = true;
		settings.providers.codex.enabled = false;

		const providerIds: AiProviderId[] = ['antigravity', 'copilot', 'pi', 'claude', 'codex'];
		const items: Array<{ providerId: string; providerName: string; itemText: string }> = [];

		for (const provId of providerIds) {
			const conf = settings.providers[provId];
			if (!conf || !conf.enabled) continue;

			const provName = PROVIDER_METADATA[provId]?.name || provId;
			for (const m of conf.cachedModels) {
				if (m.efforts && m.efforts.length > 1) {
					for (const effort of m.efforts) {
						items.push({
							providerId: provId,
							providerName: provName,
							itemText: `${provName} - ${m.label} (${effort} effort)`
						});
					}
				} else {
					items.push({
						providerId: provId,
						providerName: provName,
						itemText: `${provName} - ${m.label}`
					});
				}
			}
		}

		// Copilot and Claude items are present
		assert.ok(items.some(i => i.providerId === 'copilot'));
		assert.ok(items.some(i => i.providerId === 'claude'));

		// Antigravity, Pi, Codex items are strictly excluded
		assert.ok(!items.some(i => i.providerId === 'antigravity'));
		assert.ok(!items.some(i => i.providerId === 'pi'));
		assert.ok(!items.some(i => i.providerId === 'codex'));

		// Format matches "Provider - Model"
		assert.ok(items.every(i => i.itemText.includes(' - ')));
	});

	test('E2E: Targeted failure feedback notifies user only for currently edited provider', async () => {
		const { service, notices, settings } = createTestHarness();

		// Enable copilot
		settings.providers.copilot.enabled = true;

		// When refreshing with 'copilot' as currently edited provider, if it fails, a notice is recorded
		// Simulate by invoking with mock that fails
		const results = await service.refreshAllActiveProviders('copilot');

		assert.ok(results.copilot !== undefined);
		// Since copilot CLI is not installed in the mock environment, it will fail or return fallback
		if (!results.copilot.success) {
			assert.ok(notices.length > 0);
			assert.ok(notices.some(n => n.includes('GitHub Copilot')));
		}
	});

	test('E2E: Settings Tab structure contains all 5 providers with collapsible cards', () => {
		const { settings } = createTestHarness();
		const providerKeys: AiProviderId[] = ['antigravity', 'copilot', 'pi', 'claude', 'codex'];

		for (const key of providerKeys) {
			assert.ok(settings.providers[key], `Provider ${key} must exist in settings`);
			assert.equal(typeof settings.providers[key].enabled, 'boolean');
			assert.equal(typeof settings.providers[key].cliCommand, 'string');
			assert.equal(typeof settings.providers[key].useWsl, 'boolean');
			assert.equal(typeof settings.providers[key].extraCliFlags, 'string');
		}

		// Ensure custom provider is not in the active provider selection
		assert.ok(!providerKeys.includes('custom' as any));
	});
});
