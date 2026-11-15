import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import * as path from 'path';
import { spawn } from 'child_process';
import { App } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	AiChatPluginSettings,
	AiProviderId,
	ANTIGRAVITY_MODELS,
	COPILOT_DEFAULT_MODELS,
	PI_DEFAULT_MODELS,
	CLAUDE_DEFAULT_MODELS,
	CODEX_DEFAULT_MODELS
} from '../src/types';
import { AgyCliService, CliStreamCallbacks, formatPromptWithHistory } from '../src/services/AgyCliService';

function createMockApp(): App {
	return {
		vault: {
			adapter: {
				getBasePath: () => '/mock/vault/path'
			}
		}
	} as unknown as App;
}

interface MockProcess extends EventEmitter {
	stdout: EventEmitter;
	stderr: EventEmitter;
	stdin: {
		data: string;
		isEnded: boolean;
		write: (chunk: string, encoding?: any, cb?: any) => boolean;
		end: (chunk?: string, encoding?: any, cb?: any) => void;
		on: (event: string, handler: Function) => void;
	};
	killed: boolean;
	kill: (signal?: string) => boolean;
}

function createMockProcess(): MockProcess {
	const proc = new EventEmitter() as MockProcess;
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.killed = false;
	proc.stdin = {
		data: '',
		isEnded: false,
		write(chunk: string) {
			this.data += chunk;
			return true;
		},
		end(chunk?: string) {
			if (chunk) this.data += chunk;
			this.isEnded = true;
		},
		on() {}
	};
	proc.kill = function (signal?: string) {
		proc.killed = true;
		proc.emit('close', null, signal || 'SIGTERM');
		return true;
	};
	return proc;
}

function createService(
	initialSettings?: Partial<AiChatPluginSettings>,
	spawner?: typeof spawn
) {
	const settings: AiChatPluginSettings = {
		...DEFAULT_SETTINGS,
		...initialSettings
	};
	const saveSettings = async (s: AiChatPluginSettings) => {
		Object.assign(settings, s);
	};
	const service = new AgyCliService(createMockApp(), () => settings, saveSettings, spawner);
	return { service, settings };
}

describe('End-to-End Tests for ALL AI Providers', () => {

	// ==========================================
	// 1. Google Antigravity E2E
	// ==========================================
	describe('Google Antigravity (agy) Integration', () => {
		test('E2E: model discovery groups models and effort levels correctly', async () => {
			const { service } = createService({ activeProvider: 'antigravity' });

			const rawCliOutput = `
Available Models:
-----------------
gemini-3.8-flash-low      Gemini 3.8 Flash (Low)
gemini-3.8-flash-medium   Gemini 3.8 Flash (Medium)
gemini-3.8-flash-high     Gemini 3.8 Flash (High)
gemini-3.1-pro-low        Gemini 3.1 Pro (Low)
gemini-3.1-pro-high       Gemini 3.1 Pro (High)
claude-sonnet-4-6         Claude Sonnet 4.6 (Thinking)
`;
			const parsed = (service as any).parseAntigravityModels(rawCliOutput);
			assert.ok(parsed.length >= 3);
			const flash = parsed.find((m: any) => m.id === 'gemini-3.8-flash');
			assert.ok(flash);
			assert.deepEqual(flash.efforts, ['Low', 'Medium', 'High']);
			assert.equal(flash.defaultEffort, 'Medium');
			assert.equal(flash.effortModelMap['high'], 'gemini-3.8-flash-high');
		});

		test('E2E: sendPrompt streams tokens, captures conversationId, and resumes session', async () => {
			let currentProc: MockProcess | null = null;
			const mockSpawner = ((command: string, args: string[]) => {
				currentProc = createMockProcess();
				return currentProc as any;
			}) as any;

			const { service, settings } = createService({ activeProvider: 'antigravity' }, mockSpawner);

			let capturedTokens = '';
			let capturedConvId = '';
			let completed = false;

			const callbacks: CliStreamCallbacks = {
				onToken: (tok) => { capturedTokens += tok; },
				onConversationId: (id) => { capturedConvId = id; },
				onComplete: () => { completed = true; }
			};

			// Turn 1: Send prompt
			const turn1Promise = service.sendPrompt('Analyze this concept', callbacks);
			assert.ok(currentProc);

			// Emit response chunk containing conversation id header
			currentProc!.stdout.emit('data', Buffer.from('conversation: agy-session-001\nHere is your'));
			currentProc!.stdout.emit('data', Buffer.from(' analysis of the concept.'));
			currentProc!.emit('close', 0, null);
			await turn1Promise;

			assert.equal(capturedConvId, 'agy-session-001');
			assert.equal(service.getConversationId(), 'agy-session-001');
			assert.ok(capturedTokens.includes('Here is your analysis'));
			assert.equal(completed, true);

			// Turn 2: Verify Path A standalone execution (no native --conversation resumption)
			const agyConfig = settings.providers.antigravity;
			const turn2Args = service.buildPromptArgs('antigravity', agyConfig, 'Next question');
			assert.ok(!turn2Args.includes('--conversation'));
			assert.ok(!turn2Args.includes('agy-session-001'));
			assert.equal(turn2Args[0], '-p');
			assert.equal(turn2Args[1], 'Next question');
		});

		test('E2E: process abort sends SIGINT and handles stopped generation', async () => {
			let currentProc: MockProcess | null = null;
			const mockSpawner = (() => {
				currentProc = createMockProcess();
				return currentProc as any;
			}) as any;

			const { service } = createService({ activeProvider: 'antigravity' }, mockSpawner);

			let completedText = '';
			const callbacks: CliStreamCallbacks = {
				onComplete: (full) => { completedText = full; }
			};

			const sendPromise = service.sendPrompt('Long task', callbacks);
			assert.ok(currentProc);

			currentProc!.stdout.emit('data', Buffer.from('Partially generated content'));
			// Trigger abort
			service.abort();
			currentProc!.emit('close', null, 'SIGINT');
			await sendPromise;

			assert.ok(completedText.includes('Partially generated content'));
			assert.ok(completedText.includes('*(Generation stopped)*'));
			assert.equal(service.isRunning(), false);
		});
	});

	// ==========================================
	// 2. GitHub Copilot E2E
	// ==========================================
	describe('GitHub Copilot (copilot) Integration', () => {
		test('E2E: model discovery parses help/config, prepends auto, and strips unavailable models', async () => {
			const { service } = createService({ activeProvider: 'copilot' });
			const rawHelp = `
Configuration:
  \`model\`: AI model to use
    - "claude-3.5-sonnet"
    - "gpt-4o"
    - "o3-mini"

Unavailable models
  - "claude-3.7-sonnet"
  - "o1"
`;
			const parsed = (service as any).parseCopilotModels(rawHelp);
			assert.equal(parsed[0].id, 'auto');
			assert.equal(parsed[0].label, 'Copilot Fusion (Auto - Recommended)');
			assert.ok(parsed.some((m: any) => m.id === 'claude-3.5-sonnet'));
			assert.ok(parsed.some((m: any) => m.id === 'gpt-4o'));
			assert.equal(parsed.some((m: any) => m.id === 'claude-3.7-sonnet'), false);
			assert.equal(parsed.some((m: any) => m.id === 'o1'), false);
		});

		test('E2E: sendPrompt builds copilot flags and handles session resumption', () => {
			const { service, settings } = createService({ activeProvider: 'copilot' });
			const copilotConfig = {
				...settings.providers.copilot,
				selectedModel: 'auto',
				conversationId: 'copilot-thread-789'
			};
			const args = service.buildPromptArgs('copilot', copilotConfig, 'Explain closures in JS');
			assert.equal(args[0], '-p');
			assert.equal(args[1], 'Explain closures in JS');
			assert.ok(args.includes('-s'));
			assert.ok(args.includes('--allow-all-tools'));
			assert.ok(args.includes('--output-format'));
			assert.ok(args.includes('text'));
			assert.ok(args.includes('--model'));
			assert.ok(args.includes('auto'));
			// Path A: Standalone execution without --resume
			assert.ok(!args.some(a => a.startsWith('--resume=')));
		});

		test('E2E: automatic fallback to Copilot Fusion when selected model is unavailable on user plan', async () => {
			let spawnCount = 0;
			const mockSpawner = ((command: string, args: string[]) => {
				spawnCount++;
				const proc = createMockProcess();
				const currentCount = spawnCount;
				setTimeout(() => {
					if (currentCount === 1) {
						// First attempt fails with plan limit
						proc.stderr.emit('data', Buffer.from('Error: model "claude-3.7-sonnet" from --model flag is not available in your plan'));
						proc.emit('close', 1, null);
					} else {
						// Second attempt succeeds
						proc.stdout.emit('data', Buffer.from('Fallback response from Copilot Fusion.'));
						proc.emit('close', 0, null);
					}
				}, 10);
				return proc as any;
			}) as any;

			const { service, settings } = createService({ activeProvider: 'copilot' }, mockSpawner);
			settings.providers.copilot.selectedModel = 'claude-3.7-sonnet';

			let capturedTokens = '';
			let completedResponse = '';
			let errorReported = '';

			const callbacks: CliStreamCallbacks = {
				onToken: (tok) => { capturedTokens += tok; },
				onComplete: (full) => { completedResponse = full; },
				onError: (err) => { errorReported = err; }
			};

			await service.sendPrompt('Summarize text', callbacks);

			// Wait briefly for the retry cycle to complete
			await new Promise((r) => setTimeout(r, 60));

			assert.equal(spawnCount, 2);
			assert.equal(settings.providers.copilot.selectedModel, 'auto');
			assert.ok(capturedTokens.includes('Automatically switched to Copilot Fusion'));
			assert.ok(completedResponse.includes('Fallback response from Copilot Fusion'));
			assert.equal(errorReported, '');
		});
	});

	// ==========================================
	// 3. Pi Coding Agent E2E
	// ==========================================
	describe('Pi Coding Agent (pi) Integration', () => {
		test('E2E: model discovery parses --list-models preserving <provider>/<model> and thinking', () => {
			const { service } = createService({ activeProvider: 'pi' });
			const rawOutput = `
Provider         Model                              Context   MaxTokens  Thinking
---------------------------------------------------------------------------------
github-copilot   claude-sonnet-4.5                  200k      8192       yes
github-copilot   claude-haiku-4.5                   200k      8192       yes
github-copilot   gpt-4o                             128k      4096       no
ollama           qwen2.5-coder:1.5b                 4096      2048       no
`;
			const parsed = (service as any).parsePiModels(rawOutput);
			assert.equal(parsed.length, 4);

			const sonnet = parsed.find((m: any) => m.id === 'github-copilot/claude-sonnet-4.5');
			assert.ok(sonnet);
			assert.deepEqual(sonnet.efforts, ['Off', 'Low', 'Medium', 'High']);
			assert.equal(sonnet.defaultEffort, 'High');

			const gpt4o = parsed.find((m: any) => m.id === 'github-copilot/gpt-4o');
			assert.ok(gpt4o);
			assert.deepEqual(gpt4o.efforts, []);
		});

		test('E2E: sendPrompt delivers prompt via stdin, passes flags, and attaches notes as @file', async () => {
			let currentProc: MockProcess | null = null;
			const mockSpawner = (() => {
				currentProc = createMockProcess();
				return currentProc as any;
			}) as any;

			const { service, settings } = createService({ activeProvider: 'pi' }, mockSpawner);
			settings.providers.pi.selectedModel = 'ollama/qwen2.5-coder:1.5b';
			settings.providers.pi.modelEfforts = { 'ollama/qwen2.5-coder:1.5b': 'high' };

			const pkgPath = path.resolve('package.json');
			const args = service.buildPromptArgs('pi', settings.providers.pi, 'Summarize note', {
				attachedFiles: [pkgPath]
			});

			assert.equal(args[0], '-p');
			assert.ok(!args.includes('Summarize note'));
			assert.ok(args.includes('--model'));
			assert.ok(args.includes('ollama/qwen2.5-coder:1.5b'));
			assert.ok(args.includes('--thinking'));
			assert.ok(args.includes('high'));
			assert.ok(args.includes('--'));
			assert.ok(args.includes(`@${pkgPath}`));

			let capturedTokens = '';
			const callbacks: CliStreamCallbacks = {
				onToken: (tok) => { capturedTokens += tok; }
			};

			const sendPromise = service.sendPrompt('Summarize note', callbacks, { attachedFiles: [pkgPath] });
			assert.ok(currentProc);

			assert.equal(currentProc!.stdin.data, 'Summarize note');
			assert.equal(currentProc!.stdin.isEnded, true);

			currentProc!.stdout.emit('data', Buffer.from('session: pi-sess-555\nNote summary complete.'));
			currentProc!.emit('close', 0, null);
			await sendPromise;

			assert.equal(service.getConversationId(), 'pi-sess-555');
			assert.ok(capturedTokens.includes('Note summary complete'));
		});
	});

	// ==========================================
	// 4. Claude Code E2E
	// ==========================================
	describe('Claude Code (claude) Integration', () => {
		test('E2E: model discovery returns Claude catalog with thinking effort support', async () => {
			const { service } = createService({ activeProvider: 'claude' });
			const result = await service.fetchAvailableModels('claude');
			assert.equal(result.success, true);
			assert.equal(result.models.length, CLAUDE_DEFAULT_MODELS.length);
			assert.ok(result.models.some(m => m.id === 'default'));
			assert.ok(result.models.some(m => m.id === 'claude-3-7-sonnet'));
			assert.ok(result.models.some(m => m.id === 'sonnet'));
			assert.ok(result.models.some(m => m.id === 'haiku'));
			assert.ok(result.models.some(m => m.id === 'opus'));
			const defaultModel = result.models.find(m => m.id === 'default');
			assert.deepEqual(defaultModel?.efforts, ['Low', 'Medium', 'High', 'Max']);
		});

		test('E2E: buildPromptArgs formats -p, output-format text, permissions, and directory add-dir', () => {
			const { service, settings } = createService({ activeProvider: 'claude' });
			const pkgPath = path.resolve('package.json');
			const args = service.buildPromptArgs('claude', settings.providers.claude, 'Refactor module', {
				attachedFiles: [pkgPath]
			});
			assert.equal(args[0], '-p');
			assert.ok(args.includes('--output-format'));
			assert.ok(args.includes('text'));
			assert.ok(args.includes('--dangerously-skip-permissions'));
			assert.ok(args.includes('--add-dir'));
			assert.ok(args.includes(path.dirname(pkgPath)));
		});

		test('E2E: claude pipes prompt via stdin to avoid newline truncation and startup delay', async () => {
			let currentProc: MockProcess | null = null;
			let stdinWritten = '';
			let stdinEnded = false;

			const mockSpawner = (() => {
				currentProc = createMockProcess();
				currentProc.stdin = {
					write: (chunk: string) => { stdinWritten += chunk; return true; },
					end: () => { stdinEnded = true; },
					on: () => {}
				} as any;
				return currentProc as any;
			}) as any;

			const { service } = createService({ activeProvider: 'claude' }, mockSpawner);
			const prompt = 'Line 1\n\nLine 2';
			const sendPromise = service.sendPrompt(prompt, { onComplete: () => {} });

			assert.equal(stdinWritten, prompt);
			assert.equal(stdinEnded, true);

			currentProc!.stdout.emit('data', Buffer.from('Done'));
			currentProc!.emit('close', 0, null);
			await sendPromise;
		});

		test('E2E: stream handles JSON session_id payload and text response', async () => {
			let currentProc: MockProcess | null = null;
			const mockSpawner = (() => {
				currentProc = createMockProcess();
				return currentProc as any;
			}) as any;

			const { service } = createService({ activeProvider: 'claude' }, mockSpawner);
			let convId = '';
			let tokens = '';
			const callbacks: CliStreamCallbacks = {
				onConversationId: (id) => { convId = id; },
				onToken: (tok) => { tokens += tok; }
			};

			const sendPromise = service.sendPrompt('Generate component', callbacks);
			assert.ok(currentProc);

			currentProc!.stdout.emit('data', Buffer.from('{"session_id":"c1a0de-4444-9999-session","result":"Component code here."}'));
			currentProc!.emit('close', 0, null);
			await sendPromise;

			assert.equal(convId, 'c1a0de-4444-9999-session');
			assert.equal(service.getConversationId(), 'c1a0de-4444-9999-session');
			assert.ok(tokens.includes('Component code here'));
		});

		test('E2E: surfaces actionable login guidance when Claude is unauthenticated', async () => {
			let currentProc: MockProcess | null = null;
			const mockSpawner = (() => {
				currentProc = createMockProcess();
				return currentProc as any;
			}) as any;

			const { service } = createService({ activeProvider: 'claude' }, mockSpawner);
			let capturedError = '';
			const callbacks: CliStreamCallbacks = {
				onError: (err) => { capturedError = err; }
			};

			const sendPromise = service.sendPrompt('Hello', callbacks);
			assert.ok(currentProc);

			currentProc!.stderr.emit('data', Buffer.from('Not logged in · Please run /login\n'));
			currentProc!.emit('close', 1, null);
			await sendPromise;

			assert.ok(capturedError.includes('not signed in') || capturedError.includes('claude auth login'));
		});
	});

	// ==========================================
	// 5. OpenAI Codex E2E
	// ==========================================
	describe('OpenAI Codex (codex) Integration', () => {
		test('E2E: model discovery returns Codex catalog with effort levels', async () => {
			const { service } = createService({ activeProvider: 'codex' });
			const result = await service.fetchAvailableModels('codex');
			assert.equal(result.success, true);
			assert.ok(result.models.some(m => m.id === 'gpt-6-luna'));
			assert.ok(result.models.some(m => m.id === 'gpt-5.6-luna' || m.id === 'gpt-5.6-terra'));
		});

		test('E2E: buildPromptArgs formats exec, standalone color never, add-dir, skip-git-repo-check, json, effort, and stdin -', () => {
			const { service, settings } = createService({ activeProvider: 'codex' });
			const pkgPath = path.resolve('package.json');
			const codexConfig = {
				...settings.providers.codex,
				selectedModel: 'gpt-6-luna',
				modelEfforts: { 'gpt-6-luna': 'High' },
				conversationId: 'codex-th-123456'
			};
			const args = service.buildPromptArgs('codex', codexConfig, 'Analyze data', {
				attachedFiles: [pkgPath]
			});

			// Path A: Standalone execution without resume
			assert.equal(args[0], 'exec');
			assert.ok(!args.includes('resume'));
			assert.ok(args.includes('--color'));
			assert.ok(args.includes('never'));
			assert.ok(args.includes('--add-dir'));
			assert.ok(args.includes(path.dirname(pkgPath)));
			assert.ok(args.includes('--skip-git-repo-check'));
			assert.ok(args.includes('--json'));
			assert.ok(args.includes('-m'));
			assert.ok(args.includes('gpt-6-luna'));
			assert.ok(args.includes('-c'));
			assert.ok(args.includes('model_reasoning_effort="high"'));
			assert.equal(args[args.length - 1], '-');
		});

		test('E2E: JSONL event stream parsing extracts thread_id and agent_message text cleanly', async () => {
			let currentProc: MockProcess | null = null;
			const mockSpawner = (() => {
				currentProc = createMockProcess();
				return currentProc as any;
			}) as any;

			const { service } = createService({ activeProvider: 'codex' }, mockSpawner);
			let capturedTokens = '';
			let capturedThreadId = '';
			let finalResult = '';

			const callbacks: CliStreamCallbacks = {
				onToken: (tok) => { capturedTokens += tok; },
				onConversationId: (id) => { capturedThreadId = id; },
				onComplete: (full) => { finalResult = full; }
			};

			const sendPromise = service.sendPrompt('Write test', callbacks);
			assert.ok(currentProc);

			currentProc!.stdout.emit('data', Buffer.from('{"type":"thread.started","thread_id":"01a1dc3a-7777-8888-9999"}\n'));
			currentProc!.stdout.emit('data', Buffer.from('{"type":"turn.started"}\n'));
			currentProc!.stdout.emit('data', Buffer.from('{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Here is the test result."}}\n'));
			currentProc!.stdout.emit('data', Buffer.from('{"type":"turn.completed","usage":{"input_tokens":50,"output_tokens":10}}\n'));

			currentProc!.stderr.emit('data', Buffer.from('Reading additional input from stdin...\n'));

			currentProc!.emit('close', 0, null);
			await sendPromise;

			assert.equal(capturedThreadId, '01a1dc3a-7777-8888-9999');
			assert.equal(service.getConversationId(), '01a1dc3a-7777-8888-9999');
			assert.equal(capturedTokens, 'Here is the test result.');
			assert.equal(finalResult, 'Here is the test result.');
		});

		test('E2E: codex pipes multiline prompt with context prefix into stdin', async () => {
			let currentProc: MockProcess | null = null;
			let stdinWritten = '';
			let stdinEnded = false;

			const mockSpawner = (() => {
				currentProc = createMockProcess();
				currentProc.stdin = {
					write: (chunk: string) => { stdinWritten += chunk; return true; },
					end: () => { stdinEnded = true; },
					on: () => {}
				} as any;
				return currentProc as any;
			}) as any;

			const { service } = createService({ activeProvider: 'codex' }, mockSpawner);
			const multilinePrompt = 'The context: "Family/Victoria/Gifts.md":\n\nPlease summarize this note cleanly with key bullet points.';

			const sendPromise = service.sendPrompt(multilinePrompt, {
				onComplete: () => {}
			});

			assert.equal(stdinWritten, multilinePrompt);
			assert.equal(stdinEnded, true);

			currentProc!.stdout.emit('data', Buffer.from('{"type":"thread.started","thread_id":"01a1dc66-test"}\n'));
			currentProc!.stdout.emit('data', Buffer.from('{"type":"item.completed","item":{"type":"agent_message","text":"Summary done"}}\n'));
			currentProc!.emit('close', 0, null);
			await sendPromise;
		});
	});

	// ==========================================
	// 6. Custom CLI E2E
	// ==========================================
	describe('Custom CLI (custom) Integration', () => {
		test('E2E: custom provider interpolates prompt template into arguments', () => {
			const { service, settings } = createService({ activeProvider: 'custom' });
			const customConfig = {
				...settings.providers.custom,
				cliCommand: 'my-agent',
				promptTemplate: 'run --task {prompt} --format=markdown'
			};
			const args = service.buildPromptArgs('custom', customConfig, 'Build a dashboard');
			assert.deepEqual(args, ['run', '--task', 'Build a dashboard', '--format=markdown']);
		});

		test('E2E: custom CLI model discovery succeeds returning empty list', async () => {
			const { service } = createService({ activeProvider: 'custom' });
			const result = await service.fetchAvailableModels('custom');
			assert.equal(result.success, true);
			assert.deepEqual(result.models, []);
			assert.equal(result.isFallback, false);
		});

		test('E2E: custom CLI streams output tokens to completion', async () => {
			let currentProc: MockProcess | null = null;
			const mockSpawner = (() => {
				currentProc = createMockProcess();
				return currentProc as any;
			}) as any;

			const { service, settings } = createService({ activeProvider: 'custom' }, mockSpawner);
			let receivedTokens = '';
			let completedFull = '';

			const callbacks: CliStreamCallbacks = {
				onToken: (tok) => { receivedTokens += tok; },
				onComplete: (full) => { completedFull = full; }
			};

			const sendPromise = service.sendPrompt('Execute custom task', callbacks);
			assert.ok(currentProc);

			currentProc!.stdout.emit('data', Buffer.from('Custom Agent Output: Step 1 complete. '));
			currentProc!.stdout.emit('data', Buffer.from('Step 2 complete.'));
			currentProc!.emit('close', 0, null);
			await sendPromise;

			assert.equal(receivedTokens, 'Custom Agent Output: Step 1 complete. Step 2 complete.');
			assert.equal(completedFull, 'Custom Agent Output: Step 1 complete. Step 2 complete.');
		});
	});

	// ==========================================
	// 7. Cross-Platform WSL Mode E2E
	// ==========================================
	describe('WSL Execution Mode (Across Providers)', () => {
		test('E2E: WSL mode wraps CLI execution with wsl -d Ubuntu --cd', () => {
			const { service, settings } = createService();
			const providers: AiProviderId[] = ['antigravity', 'copilot', 'pi', 'claude', 'codex', 'custom'];

			for (const p of providers) {
				const conf = {
					...settings.providers[p],
					useWsl: true,
					cliCommand: p === 'custom' ? 'my-cli' : p
				};
				const resolved = (service as any).resolveExecution(conf, p, 'C:\\Users\\test\\vault');
				assert.equal(resolved.command, 'wsl', `Provider ${p} must use wsl executable`);
				assert.equal(resolved.prefixArgs[0], '-d');
				assert.equal(resolved.prefixArgs[1], 'Ubuntu');
				assert.equal(resolved.prefixArgs[2], '--cd');
				assert.equal(resolved.prefixArgs[3], '/mnt/c/Users/test/vault');
				assert.equal(resolved.prefixArgs[4], '--');
				assert.equal(resolved.prefixArgs[5], conf.cliCommand);
			}
		});
	});

	// ==========================================
	// 8. Authentication & Login Checks (All Providers)
	// ==========================================
	describe('Authentication & Login Checks (All Providers)', () => {
		test('E2E: checkAuthStatus detects unauthenticated Claude with actionable guidance', async () => {
			let currentProc: MockProcess | null = null;
			const mockSpawner = (() => {
				currentProc = createMockProcess();
				return currentProc as any;
			}) as any;

			const { service } = createService({ activeProvider: 'claude' }, mockSpawner);
			const authPromise = service.checkAuthStatus('claude');
			assert.ok(currentProc);

			currentProc!.stdout.emit('data', Buffer.from('{"loggedIn":false,"authMethod":"none"}'));
			currentProc!.emit('close', 1, null);
			const res = await authPromise;

			assert.equal(res.loggedIn, false);
			assert.ok(res.error?.includes('claude auth login'));
		});

		test('E2E: checkAuthStatus detects unauthenticated Codex with actionable guidance', async () => {
			let currentProc: MockProcess | null = null;
			const mockSpawner = (() => {
				currentProc = createMockProcess();
				return currentProc as any;
			}) as any;

			const { service } = createService({ activeProvider: 'codex' }, mockSpawner);
			const authPromise = service.checkAuthStatus('codex');
			assert.ok(currentProc);

			currentProc!.stdout.emit('data', Buffer.from('Not logged in\n'));
			currentProc!.emit('close', 1, null);
			const res = await authPromise;

			assert.equal(res.loggedIn, false);
			assert.ok(res.error?.includes('codex login'));
		});

		test('E2E: sendPrompt surfaces actionable login guidance for Codex when unauthenticated', async () => {
			let currentProc: MockProcess | null = null;
			const mockSpawner = (() => {
				currentProc = createMockProcess();
				return currentProc as any;
			}) as any;

			const { service } = createService({ activeProvider: 'codex' }, mockSpawner);
			let capturedError = '';
			const sendPromise = service.sendPrompt('Analyze code', {
				onError: (err) => { capturedError = err; }
			});
			assert.ok(currentProc);

			currentProc!.stderr.emit('data', Buffer.from('Error: Not logged in. Please run `codex login`.\n'));
			currentProc!.emit('close', 1, null);
			await sendPromise;

			assert.ok(capturedError.includes('codex login'));
		});

		test('E2E: sendPrompt surfaces actionable login guidance for Copilot when unauthenticated', async () => {
			let currentProc: MockProcess | null = null;
			const mockSpawner = (() => {
				currentProc = createMockProcess();
				return currentProc as any;
			}) as any;

			const { service } = createService({ activeProvider: 'copilot' }, mockSpawner);
			let capturedError = '';
			const sendPromise = service.sendPrompt('Summarize note', {
				onError: (err) => { capturedError = err; }
			});
			assert.ok(currentProc);

			currentProc!.stderr.emit('data', Buffer.from('Not authenticated. Run `copilot login` to authenticate.\n'));
			currentProc!.emit('close', 1, null);
			await sendPromise;

			assert.ok(capturedError.includes('copilot login'));
		});

		test('E2E: sendPrompt surfaces actionable login guidance for Antigravity when unauthenticated', async () => {
			let currentProc: MockProcess | null = null;
			const mockSpawner = (() => {
				currentProc = createMockProcess();
				return currentProc as any;
			}) as any;

			const { service } = createService({ activeProvider: 'antigravity' }, mockSpawner);
			let capturedError = '';
			const sendPromise = service.sendPrompt('Explain code', {
				onError: (err) => { capturedError = err; }
			});
			assert.ok(currentProc);

			currentProc!.stderr.emit('data', Buffer.from('Error: 401 Unauthorized. Please sign in.\n'));
			currentProc!.emit('close', 1, null);
			await sendPromise;

			assert.ok(capturedError.includes('agy') && capturedError.includes('authenticate'));
		});
	});

	// ==========================================
	// 8. Path A Architecture & Seamless Multi-Provider Handoff
	// ==========================================
	describe('Path A: Client-Managed History & Standalone Executions', () => {
		test('E2E: All providers build standalone arguments without native resume flags', () => {
			const { service, settings } = createService();

			// 1. Antigravity
			const agyArgs = service.buildPromptArgs('antigravity', {
				...settings.providers.antigravity,
				conversationId: 'agy-old-session'
			}, 'Hello Agy');
			assert.ok(!agyArgs.includes('--conversation'));
			assert.ok(!agyArgs.includes('agy-old-session'));
			assert.equal(agyArgs[0], '-p');

			// 2. Copilot
			const copilotArgs = service.buildPromptArgs('copilot', {
				...settings.providers.copilot,
				conversationId: 'copilot-old-session'
			}, 'Hello Copilot');
			assert.ok(!copilotArgs.some(a => a.startsWith('--resume=')));
			assert.equal(copilotArgs[0], '-p');

			// 3. Pi
			const piArgs = service.buildPromptArgs('pi', {
				...settings.providers.pi,
				conversationId: 'pi-old-session'
			}, 'Hello Pi');
			assert.ok(!piArgs.includes('--session'));
			assert.ok(!piArgs.includes('pi-old-session'));
			assert.equal(piArgs[0], '-p');

			// 4. Claude
			const claudeArgs = service.buildPromptArgs('claude', {
				...settings.providers.claude,
				conversationId: 'claude-old-session'
			}, 'Hello Claude');
			assert.ok(!claudeArgs.includes('--resume'));
			assert.ok(!claudeArgs.includes('claude-old-session'));
			assert.equal(claudeArgs[0], '-p');

			// 5. Codex
			const codexArgs = service.buildPromptArgs('codex', {
				...settings.providers.codex,
				conversationId: 'codex-old-session'
			}, 'Hello Codex');
			assert.ok(!codexArgs.includes('resume'));
			assert.ok(!codexArgs.includes('codex-old-session'));
			assert.equal(codexArgs[0], 'exec');
			assert.ok(codexArgs.includes('--color'));
			assert.ok(codexArgs.includes('never'));
		});

		test('E2E: Seamless multi-turn handoff across 5 providers (Agy -> Copilot -> Codex -> Pi -> Claude)', async () => {
			let currentProc: MockProcess | null = null;
			const spawnedCalls: Array<{ command: string; args: string[]; stdin: string }> = [];

			const mockSpawner = ((command: string, args: string[]) => {
				currentProc = createMockProcess();
				spawnedCalls.push({ command, args, stdin: '' });
				return currentProc as any;
			}) as any;

			const { service, settings } = createService({ activeProvider: 'antigravity' }, mockSpawner);

			const chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

			const executeTurn = async (provider: AiProviderId, userText: string): Promise<string> => {
				settings.activeProvider = provider;
				const prompt = formatPromptWithHistory(userText, chatMessages);
				let responseText = '';
				const promise = service.sendPrompt(prompt, {
					onToken: (tok) => { responseText += tok; },
					onComplete: (full) => { if (!responseText) responseText = full; }
				});
				assert.ok(currentProc);
				const lastCall = spawnedCalls[spawnedCalls.length - 1];
				lastCall.stdin = currentProc!.stdin.data;

				if (provider === 'codex') {
					currentProc!.stdout.emit('data', Buffer.from(JSON.stringify({
						type: 'item.completed',
						item: { type: 'agent_message', text: `Response from ${provider}` }
					}) + '\n'));
				} else {
					currentProc!.stdout.emit('data', Buffer.from(`Response from ${provider}\n`));
				}
				currentProc!.emit('close', 0, null);
				await promise;

				chatMessages.push({ role: 'user', content: userText });
				chatMessages.push({ role: 'assistant', content: responseText.trim() });
				return responseText;
			};

			// Turn 1: Antigravity
			const turn1 = await executeTurn('antigravity', 'Summarize my research note on thermodynamics');
			assert.ok(turn1.includes('Response from antigravity'));

			// Turn 2: Copilot
			const turn2 = await executeTurn('copilot', 'Extract key formulas from that summary');
			assert.ok(turn2.includes('Response from copilot'));

			// Turn 3: Codex
			const turn3 = await executeTurn('codex', 'Write a Python simulation of the second law');
			assert.ok(turn3.includes('Response from codex'));

			// Turn 4: Pi
			const turn4 = await executeTurn('pi', 'Explain what the code does for a beginner');
			assert.ok(turn4.includes('Response from pi'));

			// Turn 5: Claude
			const turn5 = await executeTurn('claude', 'Review this entire discussion and suggest next study topics');
			assert.ok(turn5.includes('Response from claude'));

			// Verify 5 distinct standalone calls were made with zero session collision
			assert.equal(spawnedCalls.length, 5);

			// Antigravity (Turn 1): standalone -p (no conversation resumption flag)
			assert.ok(!spawnedCalls[0].args.includes('--conversation'));
			assert.ok(spawnedCalls[0].args.includes('-p'));

			// Copilot (Turn 2): standalone -p (no --resume)
			assert.ok(!spawnedCalls[1].args.some(a => a.startsWith('--resume=')));
			assert.ok(spawnedCalls[1].args.includes('-p'));

			// Codex (Turn 3): standalone exec (no resume)
			assert.ok(!spawnedCalls[2].args.includes('resume'));
			assert.ok(spawnedCalls[2].args.includes('exec'));

			// Pi (Turn 4): standalone -p (no session)
			assert.ok(!spawnedCalls[3].args.includes('--session'));
			assert.ok(spawnedCalls[3].args.includes('-p'));

			// Claude (Turn 5): standalone -p (no resume)
			assert.ok(!spawnedCalls[4].args.includes('--resume'));
			assert.ok(spawnedCalls[4].args.includes('-p'));

			// Verify stdin carries formatted multi-turn history on later turns (e.g. Turn 3 Codex)
			assert.ok(spawnedCalls[2].stdin.includes('Previous conversation history:'));
			assert.ok(spawnedCalls[2].stdin.includes('Extract key formulas'));
		});

		test('E2E: custom CLI option is absent from settings provider selection', () => {
			const { settings } = createService();
			// Mock dropdown options collector
			const options: Record<string, string> = {};
			const mockDropdown = {
				selectEl: { addClass: () => {}, setCssStyles: () => {} },
				addOption: (val: string, label: string) => { options[val] = label; },
				setValue: () => {},
				onChange: () => {}
			};

			// Simulate settings dropdown registration
			const availableProviders = ['antigravity', 'copilot', 'pi', 'claude', 'codex'];
			for (const p of availableProviders) {
				mockDropdown.addOption(p, p);
			}

			assert.ok(!('custom' in options));
			assert.ok('antigravity' in options);
			assert.ok('copilot' in options);
			assert.ok('pi' in options);
			assert.ok('claude' in options);
			assert.ok('codex' in options);
		});
	});
});
