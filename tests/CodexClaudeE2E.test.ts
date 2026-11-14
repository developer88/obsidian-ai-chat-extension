import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { App } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	AiChatPluginSettings,
	CLAUDE_DEFAULT_MODELS,
	CODEX_DEFAULT_MODELS
} from '../src/types';
import { AgyCliService, CliStreamCallbacks } from '../src/services/AgyCliService';

function createMockApp(): App {
	return {
		vault: {
			adapter: {
				getBasePath: () => '/mock/vault/path'
			}
		}
	} as unknown as App;
}

function createService(initialSettings?: Partial<AiChatPluginSettings>) {
	const settings: AiChatPluginSettings = {
		...DEFAULT_SETTINGS,
		...initialSettings
	};
	const saveSettings = async (s: AiChatPluginSettings) => {
		Object.assign(settings, s);
	};
	const service = new AgyCliService(createMockApp(), () => settings, saveSettings);
	return { service, settings };
}

describe('Codex & Claude E2E & Integration Tests', () => {
	test('fetchAvailableModels returns correct defaults for Claude', async () => {
		const { service } = createService({ activeProvider: 'claude' });
		const result = await service.fetchAvailableModels('claude');
		assert.equal(result.success, true);
		assert.equal(result.models.length, CLAUDE_DEFAULT_MODELS.length);
		assert.ok(result.models.some(m => m.id === 'default'));
		assert.ok(result.models.some(m => m.id === 'claude-3-7-sonnet'));
		assert.ok(result.models.some(m => m.id === 'claude-3-5-sonnet'));
		assert.ok(result.models.some(m => m.id === 'sonnet'));
		assert.ok(result.models.some(m => m.id === 'opus'));
	});

	test('fetchAvailableModels returns models for Codex', async () => {
		const { service } = createService({ activeProvider: 'codex' });
		const result = await service.fetchAvailableModels('codex');
		assert.equal(result.success, true);
		assert.equal(result.isFallback, false);
		assert.ok(result.models.length >= CODEX_DEFAULT_MODELS.length);
		assert.ok(result.models.some(m => m.id === 'gpt-6-luna'));
		assert.ok(result.models.some(m => m.id === 'o3'));
		assert.ok(result.models.some(m => m.id === 'o3-mini'));
	});

	test('Codex JSON streaming output parses thread ID and agent text accurately', async () => {
		const { service, settings } = createService({ activeProvider: 'codex' });

		let capturedTokens = '';
		let capturedConversationId = '';
		let completedResponse = '';
		let completedConvId: string | undefined;

		const callbacks: CliStreamCallbacks = {
			onToken: (token) => {
				capturedTokens += token;
			},
			onConversationId: (id) => {
				capturedConversationId = id;
			},
			onComplete: (full, convId) => {
				completedResponse = full;
				completedConvId = convId;
			}
		};

		// Mock child process
		const mockChild = new EventEmitter() as any;
		mockChild.stdout = new EventEmitter();
		mockChild.stderr = new EventEmitter();
		mockChild.stdin = {
			write: () => {},
			end: () => {},
			on: () => {}
		};
		mockChild.killed = false;

		// Mock spawn on the service
		const originalResolve = (service as any).resolveExecution;
		(service as any).resolveExecution = () => ({ command: 'mock-codex', prefixArgs: [] });

		// Trigger sendPrompt and inject mock events
		const sendPromise = service.sendPrompt('Write a poem', callbacks);

		// Access the spawned activeProcess
		const activeProcess = (service as any).activeProcess;
		assert.ok(activeProcess, 'Process should be spawned');

		// Emit stdout events simulating Codex CLI JSONL
		activeProcess.stdout.emit(
			'data',
			Buffer.from('{"type":"thread.started","thread_id":"01a1dc38-84a0-7360-a43f-71bad61a372b"}\n')
		);
		activeProcess.stdout.emit(
			'data',
			Buffer.from('{"type":"turn.started"}\n')
		);
		activeProcess.stdout.emit(
			'data',
			Buffer.from('{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Roses are red,\\nViolets are blue."}}\n')
		);
		activeProcess.stdout.emit(
			'data',
			Buffer.from('{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":10}}\n')
		);

		// Stderr receives benign message
		activeProcess.stderr.emit('data', Buffer.from('Reading additional input from stdin...\n'));

		// Process exits successfully
		activeProcess.emit('close', 0, null);
		await sendPromise;

		assert.equal(capturedConversationId, '01a1dc38-84a0-7360-a43f-71bad61a372b');
		assert.equal(service.getConversationId(), '01a1dc38-84a0-7360-a43f-71bad61a372b');
		assert.equal(capturedTokens, 'Roses are red,\nViolets are blue.');
		assert.equal(completedResponse, 'Roses are red,\nViolets are blue.');
		assert.equal(completedConvId, '01a1dc38-84a0-7360-a43f-71bad61a372b');
	});

	test('Claude handles not logged in error gracefully without hanging', async () => {
		const { service } = createService({ activeProvider: 'claude' });

		let capturedError = '';
		const callbacks: CliStreamCallbacks = {
			onError: (err) => {
				capturedError = err;
			}
		};

		const sendPromise = service.sendPrompt('Hello Claude', callbacks);
		const activeProcess = (service as any).activeProcess;
		assert.ok(activeProcess);

		// Claude outputs "Not logged in" and exits with 1
		activeProcess.stderr.emit('data', Buffer.from('Not logged in · Please run /login\n'));
		activeProcess.emit('close', 1, null);
		await sendPromise;

		assert.ok(capturedError.includes('not signed in') || capturedError.includes('claude auth login') || capturedError.includes('Not logged in'));
	});

	test('Claude stream captures session resume identifier', async () => {
		const { service } = createService({ activeProvider: 'claude' });

		let convId = '';
		const callbacks: CliStreamCallbacks = {
			onConversationId: (id) => {
				convId = id;
			}
		};

		const sendPromise = service.sendPrompt('Hello Claude', callbacks);
		const activeProcess = (service as any).activeProcess;

		activeProcess.stdout.emit('data', Buffer.from('Starting session: claude-sess-987654321\nHere is your response.'));
		activeProcess.emit('close', 0, null);
		await sendPromise;

		assert.equal(convId, 'claude-sess-987654321');
		assert.equal(service.getConversationId(), 'claude-sess-987654321');
	});

	test('Claude stream captures session_id from JSON payload (as used in stream-json / json format)', async () => {
		const { service } = createService({ activeProvider: 'claude' });

		let convId = '';
		const callbacks: CliStreamCallbacks = {
			onConversationId: (id) => {
				convId = id;
			}
		};

		const sendPromise = service.sendPrompt('Hello Claude', callbacks);
		const activeProcess = (service as any).activeProcess;

		activeProcess.stdout.emit('data', Buffer.from('{"session_id":"3823925d-28c3-428d-9cc0-ffc90921699e","result":"Hello!"}'));
		activeProcess.emit('close', 0, null);
		await sendPromise;

		assert.equal(convId, '3823925d-28c3-428d-9cc0-ffc90921699e');
		assert.equal(service.getConversationId(), '3823925d-28c3-428d-9cc0-ffc90921699e');
	});

	test('Claude buildPromptArgs includes --add-dir for attached files', () => {
		const { service, settings } = createService({ activeProvider: 'claude' });
		const claudeConfig = settings.providers.claude;
		const pkgPath = require('path').resolve('package.json');
		const args = service.buildPromptArgs('claude', claudeConfig, 'Review this code', {
			attachedFiles: [pkgPath]
		});
		assert.equal(args[0], '-p');
		assert.equal(args[1], 'Review this code');
		assert.ok(args.includes('--add-dir'));
		assert.ok(args.includes(require('path').dirname(pkgPath)));
	});
});
