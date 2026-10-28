import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { AgyCliService, formatPromptWithHistory, HistoryTurn } from '../src/services/AgyCliService';
import {
	AiChatPluginSettings,
	DEFAULT_SETTINGS,
	ANTIGRAVITY_MODELS,
	PI_DEFAULT_MODELS,
	COPILOT_DEFAULT_MODELS
} from '../src/types';

function createMockService(initialSettings: Partial<AiChatPluginSettings> = {}) {
	const currentSettings: AiChatPluginSettings = {
		...DEFAULT_SETTINGS,
		...initialSettings,
		providers: {
			antigravity: { ...DEFAULT_SETTINGS.providers.antigravity },
			copilot: { ...DEFAULT_SETTINGS.providers.copilot },
			pi: { ...DEFAULT_SETTINGS.providers.pi },
			custom: { ...DEFAULT_SETTINGS.providers.custom },
			...(initialSettings.providers || {})
		}
	};

	const mockApp = {
		vault: {
			adapter: {
				getBasePath: () => 'C:\\Users\\test\\vault'
			}
		}
	} as any;

	const service = new AgyCliService(
		mockApp,
		() => currentSettings,
		async (newSettings) => {
			Object.assign(currentSettings, newSettings);
		}
	);

	return { service, currentSettings };
}

describe('AgyCliService - Path & Command Sanitization', () => {
	test('toWslPath converts Windows drive paths to WSL paths', () => {
		const { service } = createMockService();
		assert.equal(
			service.toWslPath('C:\\Users\\test\\vault'),
			'/mnt/c/Users/test/vault'
		);
		assert.equal(
			service.toWslPath('D:/documents/notes'),
			'/mnt/d/documents/notes'
		);
		assert.equal(
			service.toWslPath('/unix/path/already'),
			'/unix/path/already'
		);
	});

	test('sanitizeCliCommand removes or rejects dangerous shell metacharacters', () => {
		assert.equal(AgyCliService.sanitizeCliCommand('agy', 'agy'), 'agy');
		assert.equal(AgyCliService.sanitizeCliCommand('   pi   ', 'pi'), 'pi');
		assert.equal(AgyCliService.sanitizeCliCommand('/usr/local/bin/pi', 'pi'), '/usr/local/bin/pi');

		// Disallowed characters fall back to default
		assert.equal(AgyCliService.sanitizeCliCommand('agy; rm -rf /', 'agy'), 'agy');
		assert.equal(AgyCliService.sanitizeCliCommand('pi && cat /etc/passwd', 'pi'), 'pi');
		assert.equal(AgyCliService.sanitizeCliCommand('pi | grep secret', 'pi'), 'pi');
		assert.equal(AgyCliService.sanitizeCliCommand('`reboot`', 'agy'), 'agy');
		assert.equal(AgyCliService.sanitizeCliCommand('$(whoami)', 'copilot'), 'copilot');
		assert.equal(AgyCliService.sanitizeCliCommand('pi > outfile', 'pi'), 'pi');
		assert.equal(AgyCliService.sanitizeCliCommand('pi < input', 'pi'), 'pi');
	});

	test('getSpawnEnvironment includes standard binaries and custom flags', () => {
		const env = AgyCliService.getSpawnEnvironment();
		assert.equal(env.PAGER, 'cat');
		assert.equal(env.CI, '1');
		if (process.platform === 'darwin' || process.platform === 'linux') {
			assert.ok(env.PATH?.includes('/usr/bin'));
			assert.ok(env.PATH?.includes('/opt/homebrew/bin'));
		}
	});

	test('getSpawnEnvironment prepends standard and Homebrew paths on macOS and Linux', () => {
		const originalPlatform = process.platform;
		const originalPath = process.env.PATH;
		try {
			Object.defineProperty(process, 'platform', { value: 'darwin' });
			process.env.PATH = '/custom/bin:/usr/bin';
			const darwinEnv = AgyCliService.getSpawnEnvironment();
			assert.equal(darwinEnv.PAGER, 'cat');
			assert.equal(darwinEnv.CI, '1');
			assert.ok(darwinEnv.PATH?.includes('/opt/homebrew/bin'));
			assert.ok(darwinEnv.PATH?.includes('/usr/local/bin'));
			assert.ok(darwinEnv.PATH?.includes('/custom/bin'));
			const darwinSegments = darwinEnv.PATH?.split(':') || [];
			assert.equal(darwinSegments.filter(s => s === '/usr/bin').length, 1);

			Object.defineProperty(process, 'platform', { value: 'linux' });
			process.env.PATH = '/home/user/bin:/usr/bin';
			const linuxEnv = AgyCliService.getSpawnEnvironment();
			assert.ok(linuxEnv.PATH?.includes('/usr/bin'));
			assert.ok(linuxEnv.PATH?.includes('/usr/local/bin'));
			assert.ok(linuxEnv.PATH?.includes('/home/user/bin'));

			Object.defineProperty(process, 'platform', { value: 'win32' });
			const origUserProfile = process.env.USERPROFILE;
			process.env.USERPROFILE = 'C:\\Users\\testuser';
			process.env.PATH = 'C:\\Windows\\system32;C:\\Windows';
			const winEnv = AgyCliService.getSpawnEnvironment();
			assert.ok(winEnv.PATH?.includes('C:\\Users\\testuser\\.pi\\agent\\bin'));
			assert.ok(winEnv.PATH?.includes('C:\\Windows\\system32'));
			process.env.USERPROFILE = origUserProfile;
		} finally {
			Object.defineProperty(process, 'platform', { value: originalPlatform });
			process.env.PATH = originalPath;
		}
	});
});

describe('AgyCliService - Model Parsing', () => {
	const { service } = createMockService();
	const parserService = service as any;

	test('parsePiModels preserves <provider>/<model> identifier and thinking efforts', () => {
		const piTable = `
Provider         Model                  Context   Max Out   Thinking
github-copilot   claude-sonnet-4.5      200k      8192      yes
github-copilot   gpt-4o                 128k      4096      no
anthropic        claude-3-5-haiku       200k      8192      yes
`;
		const parsed = parserService.parsePiModels(piTable);
		assert.equal(parsed.length, 3);

		// Model 1 (Thinking)
		assert.equal(parsed[0].id, 'github-copilot/claude-sonnet-4.5');
		assert.equal(parsed[0].label, 'Claude Sonnet 4.5 (Github Copilot)');
		assert.deepEqual(parsed[0].efforts, ['Off', 'Low', 'Medium', 'High']);
		assert.equal(parsed[0].defaultEffort, 'High');

		// Model 2 (No thinking)
		assert.equal(parsed[1].id, 'github-copilot/gpt-4o');
		assert.equal(parsed[1].label, 'Gpt 4o (Github Copilot)');
		assert.deepEqual(parsed[1].efforts, []);
		assert.equal(parsed[1].defaultEffort, undefined);

		// Model 3 (Anthropic provider)
		assert.equal(parsed[2].id, 'anthropic/claude-3-5-haiku');
		assert.equal(parsed[2].label, 'Claude 3 5 Haiku (Anthropic)');
		assert.deepEqual(parsed[2].efforts, ['Off', 'Low', 'Medium', 'High']);
	});

	test('parsePiModels falls back to PI_DEFAULT_MODELS if output is empty or invalid', () => {
		const emptyParsed = parserService.parsePiModels('');
		assert.deepEqual(emptyParsed, PI_DEFAULT_MODELS);

		const headersOnly = parserService.parsePiModels('Provider Model Context Max Thinking\n---');
		assert.deepEqual(headersOnly, PI_DEFAULT_MODELS);
	});

	test('parsePiModels handles both Unix LF and Windows CRLF line endings', () => {
		const tableLf = "Provider         Model                  Context   Max Out   Thinking\ngithub-copilot   claude-sonnet-4.5      200k      8192      yes\nanthropic        claude-3-5-haiku       200k      8192      no\n";
		const parsedLf = parserService.parsePiModels(tableLf);
		assert.equal(parsedLf.length, 2);
		assert.equal(parsedLf[0].id, 'github-copilot/claude-sonnet-4.5');
		assert.deepEqual(parsedLf[0].efforts, ['Off', 'Low', 'Medium', 'High']);
		assert.equal(parsedLf[1].id, 'anthropic/claude-3-5-haiku');
		assert.deepEqual(parsedLf[1].efforts, []);

		const tableCrlf = "Provider         Model                  Context   Max Out   Thinking\r\ngithub-copilot   claude-sonnet-4.5      200k      8192      yes\r\nanthropic        claude-3-5-haiku       200k      8192      no\r\n";
		const parsedCrlf = parserService.parsePiModels(tableCrlf);
		assert.equal(parsedCrlf.length, 2);
		assert.equal(parsedCrlf[0].id, 'github-copilot/claude-sonnet-4.5');
		assert.deepEqual(parsedCrlf[0].efforts, ['Off', 'Low', 'Medium', 'High']);
		assert.equal(parsedCrlf[1].id, 'anthropic/claude-3-5-haiku');
		assert.deepEqual(parsedCrlf[1].efforts, []);
	});

	test('parseAntigravityModels groups effort levels into effortModelMap', () => {
		const agyList = `
gemini-3.8-flash-low      Gemini 3.8 Flash (Low)
gemini-3.8-flash-medium   Gemini 3.8 Flash (Medium)
gemini-3.8-flash-high     Gemini 3.8 Flash (High)
claude-sonnet-4-6         Claude Sonnet 4.6
`;
		const parsed = parserService.parseAntigravityModels(agyList);
		assert.equal(parsed.length, 2);

		const flash = parsed.find((m: any) => m.id === 'gemini-3.8-flash');
		assert.ok(flash);
		assert.deepEqual(flash.efforts, ['Low', 'Medium', 'High']);
		assert.equal(flash.defaultEffort, 'Medium');
		assert.equal(flash.effortModelMap['low'], 'gemini-3.8-flash-low');
		assert.equal(flash.effortModelMap['medium'], 'gemini-3.8-flash-medium');
		assert.equal(flash.effortModelMap['high'], 'gemini-3.8-flash-high');

		const sonnet = parsed.find((m: any) => m.id === 'claude-sonnet-4-6');
		assert.ok(sonnet);
		assert.deepEqual(sonnet.efforts, []);
	});

	test('parseAntigravityModels handles both Unix LF and Windows CRLF line endings', () => {
		const agyTableLf = "Available Models:\n  gemini-2.5-pro\n  gemini-2.5-flash-low\n  gemini-2.5-flash-medium\n  gemini-2.5-flash-high\n";
		const parsedLf = parserService.parseAntigravityModels(agyTableLf);
		const flashLf = parsedLf.find((m: any) => m.id === 'gemini-2.5-flash');
		assert.ok(flashLf);
		assert.deepEqual(flashLf.efforts, ['Low', 'Medium', 'High']);

		const agyTableCrlf = "Available Models:\r\n  gemini-2.5-pro\r\n  gemini-2.5-flash-low\r\n  gemini-2.5-flash-medium\r\n  gemini-2.5-flash-high\r\n";
		const parsedCrlf = parserService.parseAntigravityModels(agyTableCrlf);
		const flashCrlf = parsedCrlf.find((m: any) => m.id === 'gemini-2.5-flash');
		assert.ok(flashCrlf);
		assert.deepEqual(flashCrlf.efforts, ['Low', 'Medium', 'High']);
	});

	test('parseCopilotModels extracts choices from help text and prepends auto', () => {
		const helpText = `
Options:
  --model <model>  Model to use (choices: "claude-sonnet-4.5", "gpt-4o", "o1-mini")
`;
		const parsed = parserService.parseCopilotModels(helpText);
		assert.equal(parsed.length, 4);
		assert.equal(parsed[0].id, 'auto');
		assert.equal(parsed[1].id, 'claude-sonnet-4.5');
		assert.equal(parsed[2].id, 'gpt-4o');
		assert.equal(parsed[3].id, 'o1-mini');
	});

	test('parseCopilotModels extracts models from `copilot help config` output and prepends auto', () => {
		const configText = `
Configuration Settings:

  \`includeCoAuthoredBy\`: whether to add a Co-authored-by trailer; defaults to \`true\`.

  \`model\`: AI model to use for Copilot CLI; can be changed with /model command or --model flag option.
    - "claude-sonnet-4.6"
    - "gpt-5.4-mini"
    - "gemini-3.5-flash"

  \`contextTier\`: context window tier for tiered-pricing models (e.g., "default" or "long_context").
    - Can also be set with --context flag (overrides persisted setting)
`;
		const parsed = parserService.parseCopilotModels(configText);
		assert.deepEqual(parsed.map((m: any) => m.id), ['auto', 'claude-sonnet-4.6', 'gpt-5.4-mini', 'gemini-3.5-flash']);
	});

	test('parseCopilotModels handles Windows CRLF line endings in `copilot help config` output', () => {
		const crlfConfigText = "Configuration Settings:\r\n\r\n  `model`: AI model to use for Copilot CLI;\r\n    - \"claude-sonnet-4.6\"\r\n    - \"gpt-5.4-mini\"\r\n\r\n  `contextTier`: context tier\r\n";
		const parsed = parserService.parseCopilotModels(crlfConfigText);
		assert.deepEqual(parsed.map((m: any) => m.id), ['auto', 'claude-sonnet-4.6', 'gpt-5.4-mini']);
	});

	test('parseCopilotModels deduplicates repeated model IDs in config output', () => {
		const duplicateText = `
  \`model\`: AI model to use
    - "claude-sonnet-4.6"
    - "claude-sonnet-4.6"
    - "gpt-5.4-mini"
`;
		const parsed = parserService.parseCopilotModels(duplicateText);
		assert.deepEqual(parsed.map((m: any) => m.id), ['auto', 'claude-sonnet-4.6', 'gpt-5.4-mini']);
	});

	test('parseCopilotModels extracts models from legacy `allowed values` help text', () => {
		const allowedText = `
Options:
  --model <model>  Model to use (allowed values: 'claude-3.5-sonnet', 'gpt-4o')
`;
		const parsed = parserService.parseCopilotModels(allowedText);
		assert.deepEqual(parsed.map((m: any) => m.id), ['auto', 'claude-3.5-sonnet', 'gpt-4o']);
	});

	test('parseCopilotModels falls back to COPILOT_DEFAULT_MODELS when no models match in CLI output', () => {
		assert.deepEqual(parserService.parseCopilotModels(''), COPILOT_DEFAULT_MODELS);
		assert.deepEqual(parserService.parseCopilotModels('Usage: copilot <command> [flags]'), COPILOT_DEFAULT_MODELS);
		assert.equal(COPILOT_DEFAULT_MODELS[0].label, 'Copilot Fusion (Auto - Recommended)');
	});

	test('parseCopilotModels strips `Unavailable models` section and ignores unaccessible plan models', () => {
		const screenWithUnavailable = `
Configuration Settings:
  \`model\`: AI model to use
    - "gpt-4o"

Unavailable models
  - "claude-haiku-5.5"
  - "kimi-k3"
`;
		const parsed = parserService.parseCopilotModels(screenWithUnavailable);
		assert.deepEqual(parsed.map((m: any) => m.id), ['auto', 'gpt-4o']);
		assert.equal(parsed.some((m: any) => m.id === 'claude-haiku-5.5'), false);
		assert.equal(parsed[0].label, 'Copilot Fusion (Auto - Recommended)');
	});

	test('getModelDiscoveryArgs returns appropriate CLI arguments per provider', () => {
		assert.deepEqual(parserService.getModelDiscoveryArgs('copilot'), ['help', 'config']);
		assert.deepEqual(parserService.getModelDiscoveryArgs('pi'), ['--list-models']);
		assert.deepEqual(parserService.getModelDiscoveryArgs('antigravity'), ['models']);
		assert.deepEqual(parserService.getModelDiscoveryArgs('custom'), []);
	});
});

describe('AgyCliService - Session & Provider State', () => {
	test('getConversationId and setConversationId persist per active provider', async () => {
		const { service, currentSettings } = createMockService();

		// Default provider: antigravity
		assert.equal(service.getConversationId(), null);
		service.setConversationId('conv-12345');
		assert.equal(service.getConversationId(), 'conv-12345');
		assert.equal(currentSettings.providers.antigravity.conversationId, 'conv-12345');

		// Switch provider to pi
		currentSettings.activeProvider = 'pi';
		assert.equal(service.getConversationId(), null);
		service.setConversationId('pi-session-abc');
		assert.equal(service.getConversationId(), 'pi-session-abc');
		assert.equal(currentSettings.providers.pi.conversationId, 'pi-session-abc');
		// Ensure antigravity was unchanged
		assert.equal(currentSettings.providers.antigravity.conversationId, 'conv-12345');

		// Reset session
		service.resetSession();
		assert.equal(service.getConversationId(), null);
		assert.equal(currentSettings.providers.pi.conversationId, null);
	});
});

describe('AgyCliService - resolveExecution', () => {
	const { service } = createMockService();
	const resolverService = service as any;

	test('resolves command for WSL with distro and vault cd prefix', () => {
		const config = {
			...DEFAULT_SETTINGS.providers.antigravity,
			useWsl: true,
			cliCommand: 'agy'
		};
		const resolved = resolverService.resolveExecution(config, 'antigravity', 'C:\\Users\\test\\vault');
		assert.equal(resolved.command, 'wsl');
		assert.deepEqual(resolved.prefixArgs, ['-d', 'Ubuntu', '--cd', '/mnt/c/Users/test/vault', '--', 'agy']);
	});

	test('resolves command for Windows cmd wrappers or standard executables', () => {
		const originalPlatform = process.platform;
		try {
			Object.defineProperty(process, 'platform', { value: 'win32' });

			// Pi on win32 defaults to cmd.exe /c pi (or ~/.pi/agent/bin/pi.cmd if standalone is installed)
			const piConfig = { ...DEFAULT_SETTINGS.providers.pi, cliCommand: 'pi' };
			const piResolved = resolverService.resolveExecution(piConfig, 'pi');
			assert.equal(piResolved.command, 'cmd.exe');
			assert.equal(piResolved.prefixArgs[0], '/c');
			assert.ok(piResolved.prefixArgs[1].endsWith('pi') || piResolved.prefixArgs[1].endsWith('pi.cmd'));

			// .cmd/.bat script
			const batConfig = { ...DEFAULT_SETTINGS.providers.copilot, cliCommand: 'my-copilot.bat' };
			const batResolved = resolverService.resolveExecution(batConfig, 'copilot');
			assert.equal(batResolved.command, 'cmd.exe');
			assert.deepEqual(batResolved.prefixArgs, ['/c', 'my-copilot.bat']);

			// agy on win32 defaults to agy.exe
			const agyConfig = { ...DEFAULT_SETTINGS.providers.antigravity, cliCommand: 'agy' };
			const agyResolved = resolverService.resolveExecution(agyConfig, 'antigravity');
			assert.equal(agyResolved.command, 'agy.exe');
			assert.deepEqual(agyResolved.prefixArgs, []);

			// custom agent (e.g. super-ai) on win32 defaults to cmd.exe /c super-ai
			const customConfig = { ...DEFAULT_SETTINGS.providers.custom, cliCommand: 'super-ai' };
			const customResolved = resolverService.resolveExecution(customConfig, 'custom');
			assert.equal(customResolved.command, 'cmd.exe');
			assert.deepEqual(customResolved.prefixArgs, ['/c', 'super-ai']);
		} finally {
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		}
	});

	test('resolves command for Unix/Linux/macOS standard executables without cmd.exe or .exe', () => {
		const originalPlatform = process.platform;
		const originalHome = process.env.HOME;
		try {
			Object.defineProperty(process, 'platform', { value: 'linux' });
			process.env.HOME = '/nonexistent_test_home';

			// Pi on Linux/macOS runs 'pi' directly (no cmd.exe wrapper)
			const piConfig = { ...DEFAULT_SETTINGS.providers.pi, cliCommand: 'pi', useWsl: false };
			const piResolved = resolverService.resolveExecution(piConfig, 'pi');
			assert.equal(piResolved.command, 'pi');
			assert.deepEqual(piResolved.prefixArgs, []);

			// Antigravity on Linux/macOS runs 'agy' directly (no .exe extension)
			const agyConfig = { ...DEFAULT_SETTINGS.providers.antigravity, cliCommand: 'agy', useWsl: false };
			const agyResolved = resolverService.resolveExecution(agyConfig, 'antigravity');
			assert.equal(agyResolved.command, 'agy');
			assert.deepEqual(agyResolved.prefixArgs, []);

			// Copilot on Linux/macOS runs 'copilot' directly
			const copilotConfig = { ...DEFAULT_SETTINGS.providers.copilot, cliCommand: 'copilot', useWsl: false };
			const copilotResolved = resolverService.resolveExecution(copilotConfig, 'copilot');
			assert.equal(copilotResolved.command, 'copilot');
			assert.deepEqual(copilotResolved.prefixArgs, []);

			// Custom CLI runs binary directly without cmd.exe
			const customConfig = { ...DEFAULT_SETTINGS.providers.custom, cliCommand: 'super-ai', useWsl: false };
			const customResolved = resolverService.resolveExecution(customConfig, 'custom');
			assert.equal(customResolved.command, 'super-ai');
			assert.deepEqual(customResolved.prefixArgs, []);

			// Absolute Unix paths (e.g. /usr/local/bin or /opt/homebrew/bin)
			const homebrewConfig = { ...DEFAULT_SETTINGS.providers.antigravity, cliCommand: '/opt/homebrew/bin/agy', useWsl: false };
			const homebrewResolved = resolverService.resolveExecution(homebrewConfig, 'antigravity');
			assert.equal(homebrewResolved.command, '/opt/homebrew/bin/agy');
			assert.deepEqual(homebrewResolved.prefixArgs, []);
		} finally {
			Object.defineProperty(process, 'platform', { value: originalPlatform });
			process.env.HOME = originalHome;
		}
	});

	test('custom provider returns empty model discovery without error', async () => {
		const { service } = createMockService({ activeProvider: 'custom' });
		const res = await service.fetchAvailableModels('custom');
		assert.equal(res.success, true);
		assert.deepEqual(res.models, []);
		assert.equal(res.isFallback, false);
	});
});

describe('AgyCliService - buildCustomCliArgs', () => {
	test('formats default template "tell {prompt}" into arguments', () => {
		const args = AgyCliService.buildCustomCliArgs('tell {prompt}', 'Hello world');
		assert.deepEqual(args, ['tell', 'Hello world']);
	});

	test('formats prompt when {prompt} is standalone or embedded', () => {
		const args1 = AgyCliService.buildCustomCliArgs('{prompt}', 'Test prompt');
		assert.deepEqual(args1, ['Test prompt']);

		const args2 = AgyCliService.buildCustomCliArgs('run --query={prompt}', 'Search query');
		assert.deepEqual(args2, ['run', '--query=Search query']);
	});

	test('appends prompt when template omits {prompt}', () => {
		const args = AgyCliService.buildCustomCliArgs('ask', 'Hello');
		assert.deepEqual(args, ['ask', 'Hello']);
	});

	test('falls back to "tell {prompt}" when template is undefined or blank', () => {
		const args1 = AgyCliService.buildCustomCliArgs(undefined, 'Draft text');
		assert.deepEqual(args1, ['tell', 'Draft text']);

		const args2 = AgyCliService.buildCustomCliArgs('   ', 'Draft text');
		assert.deepEqual(args2, ['tell', 'Draft text']);
	});
});

describe('formatPromptWithHistory - Multi-Turn Conversation Context', () => {
	test('returns raw prompt when history is empty (Turn 1)', () => {
		const rawPrompt = 'The context: "/path/to/note.md":\n\nImprove the writing of this note';
		const result = formatPromptWithHistory(rawPrompt, []);
		assert.equal(result, rawPrompt);
	});

	test('formats previous turns with context and assistant responses (Turn 2)', () => {
		const history: HistoryTurn[] = [
			{
				role: 'user',
				content: 'Improve the writing of this note',
				attachedNotePath: '/path/to/note.md'
			},
			{
				role: 'assistant',
				content: 'Here is the improved note:\n# Summary\nMuch better text.'
			}
		];
		const currentPrompt = 'The context: "/path/to/note.md":\n\nWrite it back to the original file';
		const result = formatPromptWithHistory(currentPrompt, history);

		assert.ok(result.includes('Previous conversation history:'));
		assert.ok(result.includes('User:\nThe context: "/path/to/note.md":\n\nImprove the writing of this note'));
		assert.ok(result.includes('Assistant:\nHere is the improved note:\n# Summary\nMuch better text.'));
		assert.ok(result.includes('---\n\nCurrent request:\nThe context: "/path/to/note.md":\n\nWrite it back to the original file'));
	});

	test('formats selection context in previous turns', () => {
		const history: HistoryTurn[] = [
			{
				role: 'user',
				content: 'Translate this snippet',
				attachedNotePath: '/path/to/note.md',
				attachedSelection: 'const foo = 42;'
			},
			{
				role: 'assistant',
				content: 'Translated snippet.'
			}
		];
		const result = formatPromptWithHistory('Now optimize it', history);
		assert.ok(result.includes('Regarding the selected text in file "/path/to/note.md":\n"""\nconst foo = 42;\n"""\n\nTranslate this snippet'));
	});

	test('does not duplicate context prefix if user content already has it', () => {
		const history: HistoryTurn[] = [
			{
				role: 'user',
				content: 'The context: "/path/to/note.md":\n\nAlready prefixed',
				attachedNotePath: '/path/to/note.md'
			}
		];
		const result = formatPromptWithHistory('Next turn', history);
		assert.ok(!result.includes('The context: "/path/to/note.md":\n\nThe context:'));
	});

	test('ignores empty or whitespace-only messages', () => {
		const history: HistoryTurn[] = [
			{ role: 'user', content: '   ' },
			{ role: 'assistant', content: '' }
		];
		const result = formatPromptWithHistory('Hello', history);
		assert.equal(result, 'Hello');
	});

	test('limits history to maxHistoryTurns', () => {
		const history: HistoryTurn[] = [
			{ role: 'user', content: 'Turn 1' },
			{ role: 'assistant', content: 'Reply 1' },
			{ role: 'user', content: 'Turn 2' },
			{ role: 'assistant', content: 'Reply 2' },
			{ role: 'user', content: 'Turn 3' },
			{ role: 'assistant', content: 'Reply 3' }
		];
		const result = formatPromptWithHistory('Turn 4', history, { maxHistoryTurns: 2 });
		assert.ok(!result.includes('Turn 1'));
		assert.ok(!result.includes('Turn 2'));
		assert.ok(result.includes('Turn 3'));
		assert.ok(result.includes('Reply 3'));
	});

	test('limits history length when exceeding maxHistoryChars', () => {
		const history: HistoryTurn[] = [
			{ role: 'user', content: 'A'.repeat(500) },
			{ role: 'assistant', content: 'B'.repeat(500) }
		];
		const result = formatPromptWithHistory('Turn 2', history, { maxHistoryChars: 600 });
		assert.ok(result.length < 1000);
		assert.ok(result.includes('Turn 2'));
	});
});

describe('AgyCliService - buildPromptArgs', () => {
	const { service } = createMockService();

	test('pi passes -p without prompt string and appends model and thinking flags', () => {
		const piConfig = {
			...DEFAULT_SETTINGS.providers.pi,
			selectedModel: 'ollama/qwen2.5-coder:1.5b',
			modelEfforts: { 'ollama/qwen2.5-coder:1.5b': 'high' }
		};
		const args = service.buildPromptArgs('pi', piConfig, 'Hello Pi');
		assert.equal(args[0], '-p');
		// Prompt must NOT be an argument on the command line for Pi (it is passed over stdin)
		assert.ok(!args.includes('Hello Pi'));
		assert.ok(args.includes('--model'));
		assert.ok(args.includes('ollama/qwen2.5-coder:1.5b'));
		assert.ok(args.includes('--thinking'));
		assert.ok(args.includes('high'));
	});

	test('pi appends @file arguments when attachedFiles exist on disk', () => {
		const piConfig = {
			...DEFAULT_SETTINGS.providers.pi,
			selectedModel: 'ollama/qwen2.5-coder:1.5b'
		};
		// package.json exists in repo root
		const pkgPath = path.resolve('package.json');
		const args = service.buildPromptArgs('pi', piConfig, 'Summarize note', {
			attachedFiles: [pkgPath, '/nonexistent/file.md']
		});
		assert.equal(args[0], '-p');
		assert.ok(!args.includes('Summarize note'));
		assert.ok(args.includes('--'));
		assert.ok(args.includes(`@${pkgPath}`));
		assert.ok(!args.includes('@/nonexistent/file.md'));
	});

	test('copilot passes -p with prompt string, -s, --allow-all-tools, and --output-format text', () => {
		const copilotConfig = {
			...DEFAULT_SETTINGS.providers.copilot,
			selectedModel: 'auto'
		};
		const args = service.buildPromptArgs('copilot', copilotConfig, 'Summarize this');
		assert.equal(args[0], '-p');
		assert.equal(args[1], 'Summarize this');
		assert.ok(args.includes('-s'));
		assert.ok(args.includes('--allow-all-tools'));
		assert.ok(args.includes('--output-format'));
		assert.ok(args.includes('--model'));
		assert.ok(args.includes('auto'));
	});

	test('antigravity passes -p with prompt string, --output-format text, and --dangerously-skip-permissions', () => {
		const agyConfig = {
			...DEFAULT_SETTINGS.providers.antigravity,
			selectedModel: 'gemini-3.8-flash'
		};
		const args = service.buildPromptArgs('antigravity', agyConfig, 'Summarize this');
		assert.equal(args[0], '-p');
		assert.equal(args[1], 'Summarize this');
		assert.ok(args.includes('--output-format'));
		assert.ok(args.includes('--dangerously-skip-permissions'));
		assert.ok(args.includes('--model'));
	});
});


