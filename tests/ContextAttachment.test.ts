import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatPromptWithHistory, HistoryTurn } from '../src/services/AgyCliService';
import { DEFAULT_SETTINGS, AiChatPluginSettings } from '../src/types';

describe('Context Attachment - Settings Defaults', () => {
	test('has expected default settings for context attachment', () => {
		assert.equal(DEFAULT_SETTINGS.enableContextAttachment, false);
		assert.equal(DEFAULT_SETTINGS.autoAttachContext, true);
		assert.equal(DEFAULT_SETTINGS.contextScope, 'file');
		assert.equal(DEFAULT_SETTINGS.contextPath, '');
	});
});

describe('Context Attachment - formatPromptWithHistory formatting', () => {
	test('formats attachedContextPath in history turn with "Here is the context:" prefix', () => {
		const history: HistoryTurn[] = [
			{
				role: 'user',
				content: 'Summarize the documentation',
				attachedContextPath: '/vault/docs/context.md',
				attachedContextScope: 'file'
			},
			{
				role: 'assistant',
				content: 'Documentation summary: ...'
			}
		];

		const currentPrompt = 'Now explain section 2';
		const formatted = formatPromptWithHistory(currentPrompt, history);

		assert.ok(formatted.includes('Previous conversation history:'));
		assert.ok(formatted.includes('Here is the context: "/vault/docs/context.md":\n\nSummarize the documentation'));
		assert.ok(formatted.includes('Assistant:\nDocumentation summary: ...'));
		assert.ok(formatted.includes('Current request:\nNow explain section 2'));
	});

	test('formats both attachedContextPath and attachedNotePath correctly in history', () => {
		const history: HistoryTurn[] = [
			{
				role: 'user',
				content: 'How does this relate?',
				attachedContextPath: '/vault/context-folder',
				attachedContextScope: 'folder',
				attachedNotePath: '/vault/notes/active.md'
			},
			{
				role: 'assistant',
				content: 'It relates in the following ways...'
			}
		];

		const currentPrompt = 'Follow up question';
		const formatted = formatPromptWithHistory(currentPrompt, history);

		assert.ok(formatted.includes('Here is the context: "/vault/context-folder":\n\n'));
		assert.ok(formatted.includes('The context: "/vault/notes/active.md":\n\n'));
		assert.ok(formatted.includes('How does this relate?'));
	});

	test('does not duplicate context prefix in history if user message already includes it', () => {
		const history: HistoryTurn[] = [
			{
				role: 'user',
				content: 'Here is the context: "/vault/docs/context.md":\n\nSummarize this',
				attachedContextPath: '/vault/docs/context.md'
			}
		];

		const formatted = formatPromptWithHistory('Next question', history);
		// Should only occur once in the history block
		const occurrences = (formatted.match(/Here is the context: "\/vault\/docs\/context\.md":/g) || []).length;
		assert.equal(occurrences, 1);
	});
});

describe('Context Attachment - Multi-Turn Session Deduplication Simulation', () => {
	interface SessionState {
		settings: AiChatPluginSettings;
		includeContext: boolean;
		contextSentInSession: boolean;
		messages: Array<{
			role: 'user' | 'assistant';
			content: string;
			attachedContextPath?: string;
			attachedContextScope?: 'file' | 'folder';
			attachedNotePath?: string;
		}>;
	}

	function createSession(overrides: Partial<AiChatPluginSettings> = {}): SessionState {
		const settings: AiChatPluginSettings = {
			...DEFAULT_SETTINGS,
			enableContextAttachment: true,
			contextPath: '/vault/project-context.md',
			contextScope: 'file',
			...overrides
		};
		return {
			settings,
			includeContext: settings.autoAttachContext,
			contextSentInSession: false,
			messages: []
		};
	}

	function sendTurn(session: SessionState, userText: string): { cliPrompt: string; userMessageContent: string } {
		let additionalContextPrefix = '';
		let attachedContextPath: string | undefined;
		let attachedContextScope: 'file' | 'folder' | undefined;

		if (session.settings.enableContextAttachment && session.includeContext && !session.contextSentInSession) {
			const targetPath = session.settings.contextPath || '/vault/default';
			additionalContextPrefix = `Here is the context: "${targetPath}":\n\n`;
			attachedContextPath = targetPath;
			attachedContextScope = session.settings.contextScope;
			session.contextSentInSession = true;
		}

		const rawCurrentPrompt = `${additionalContextPrefix}${userText}`;

		const historyTurns: HistoryTurn[] = session.messages.map(m => ({
			role: m.role,
			content: m.content,
			attachedContextPath: m.attachedContextPath,
			attachedContextScope: m.attachedContextScope,
			attachedNotePath: m.attachedNotePath
		}));

		const cliPrompt = formatPromptWithHistory(rawCurrentPrompt, historyTurns);

		session.messages.push({
			role: 'user',
			content: userText,
			attachedContextPath,
			attachedContextScope
		});

		// Simulate assistant response
		session.messages.push({
			role: 'assistant',
			content: `Response to: ${userText}`
		});

		return { cliPrompt, userMessageContent: userText };
	}

	function restartSession(session: SessionState): void {
		session.messages = [];
		session.contextSentInSession = false;
		session.includeContext = session.settings.autoAttachContext;
	}

	test('Turn 1 sends context prefix; Turn 2 omits it from the current request while preserving it in history', () => {
		const session = createSession();

		// Turn 1
		const turn1 = sendTurn(session, 'First message');
		assert.ok(turn1.cliPrompt.startsWith('Here is the context: "/vault/project-context.md":\n\nFirst message'));
		assert.equal(session.contextSentInSession, true);
		assert.equal(session.messages[0].attachedContextPath, '/vault/project-context.md');

		// Turn 2 in the same session
		const turn2 = sendTurn(session, 'Second message');
		// The current request in CLI prompt should NOT have the prefix
		assert.ok(turn2.cliPrompt.includes('Current request:\nSecond message'));
		assert.ok(!turn2.cliPrompt.includes('Current request:\nHere is the context:'));
		// But history should contain the context from Turn 1
		assert.ok(turn2.cliPrompt.includes('Here is the context: "/vault/project-context.md":\n\nFirst message'));
		// Turn 2's own message should not have attachedContextPath
		assert.equal(session.messages[2].attachedContextPath, undefined);
	});

	test('Restarting session resets deduplication, allowing context to be sent again', () => {
		const session = createSession();

		// Turn 1
		sendTurn(session, 'First message');
		assert.equal(session.contextSentInSession, true);

		// Restart session
		restartSession(session);
		assert.equal(session.contextSentInSession, false);
		assert.equal(session.messages.length, 0);

		// Next turn after restart should include context again
		const postRestartTurn = sendTurn(session, 'Brand new session message');
		assert.ok(postRestartTurn.cliPrompt.startsWith('Here is the context: "/vault/project-context.md":\n\nBrand new session message'));
		assert.equal(session.contextSentInSession, true);
	});

	test('When feature is disabled, context prefix is never sent', () => {
		const session = createSession({ enableContextAttachment: false });

		const turn1 = sendTurn(session, 'Hello with feature disabled');
		assert.equal(turn1.cliPrompt, 'Hello with feature disabled');
		assert.equal(session.contextSentInSession, false);
		assert.equal(session.messages[0].attachedContextPath, undefined);
	});

	test('When user explicitly detaches context, context prefix is not sent', () => {
		const session = createSession();
		session.includeContext = false; // User clicked detach

		const turn1 = sendTurn(session, 'Hello with detached context');
		assert.equal(turn1.cliPrompt, 'Hello with detached context');
		assert.equal(session.contextSentInSession, false);
		assert.equal(session.messages[0].attachedContextPath, undefined);
	});

	test('Folder scope attaches folder path correctly', () => {
		const session = createSession({
			contextScope: 'folder',
			contextPath: '/vault/my-folder'
		});

		const turn1 = sendTurn(session, 'Explain the contents of this folder');
		assert.ok(turn1.cliPrompt.includes('Here is the context: "/vault/my-folder":\n\nExplain the contents'));
		assert.equal(session.messages[0].attachedContextScope, 'folder');
	});
});
