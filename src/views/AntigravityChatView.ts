import {
	ItemView,
	WorkspaceLeaf,
	MarkdownRenderer,
	MarkdownView,
	setIcon,
	Notice,
	FileSystemAdapter
} from 'obsidian';
import {
	AiChatPluginSettings,
	ChatMessage,
	ActiveNoteContext,
	PROVIDER_METADATA
} from '../types';
import { AgyCliService } from '../services/AgyCliService';

export const ANTIGRAVITY_CHAT_VIEW_TYPE = 'antigravity-chat-view';

export class AntigravityChatView extends ItemView {
	private messages: ChatMessage[] = [];
	private messagesContainerEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtnEl!: HTMLButtonElement;
	private contextPillEl!: HTMLElement;
	private modelTriggerBtn!: HTMLElement;
	private modelTriggerLabel!: HTMLElement;
	private sessionBadgeEl!: HTMLElement;
	private refreshModelsBtn!: HTMLElement;
	private isStreaming = false;
	private includeActiveNote = true;
	private currentActiveContext: ActiveNoteContext | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private cliService: AgyCliService,
		private getSettings: () => AiChatPluginSettings,
		private saveSettings: (settings: AiChatPluginSettings) => Promise<void>,
		private openSettingsTab: () => void,
		private openModelSelector: () => void
	) {
		super(leaf);
	}

	getViewType(): string {
		return ANTIGRAVITY_CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Sidecar AI';
	}

	getIcon(): string {
		return 'bot';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('agy-chat-root');

		this.includeActiveNote = this.getSettings().autoAttachActiveNote;

		// Native view header actions (top bar of the pane)
		this.addAction('rotate-ccw', 'New session', () => {
			void this.restartSession();
		});
		this.addAction('settings', 'Sidecar AI settings', () => {
			this.openSettingsTab();
		});

		this.buildHeader(container);
		this.buildToolbar(container);
		this.buildMessageList(container);
		this.buildQuickActions(container);
		this.buildContextPill(container);
		this.buildInputArea(container);

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateActiveDocumentContext();
			})
		);

		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				this.updateActiveDocumentContext();
			})
		);

		this.updateActiveDocumentContext();
		this.updateModelSelectionFromSettings();
	}

	private buildHeader(parent: HTMLElement): void {
		const header = parent.createDiv({ cls: 'agy-header' });

		const titleGroup = header.createDiv({ cls: 'agy-title-group' });
		const titleIcon = titleGroup.createSpan({ cls: 'agy-title-icon' });
		setIcon(titleIcon, 'bot');
		titleGroup.createSpan({ text: 'Sidecar AI', cls: 'agy-title-text' });

		const convId = this.cliService.getConversationId();
		this.sessionBadgeEl = titleGroup.createSpan({
			cls: 'agy-session-badge',
			text: convId ? `ID: ${convId.slice(0, 6)}` : ''
		});
		if (!convId) {
			this.sessionBadgeEl.setCssStyles({ display: 'none' });
		}

		const actionsGroup = header.createDiv({ cls: 'agy-header-actions' });

		// New Session Icon Button
		const newSessionBtn = actionsGroup.createDiv({
			cls: 'clickable-icon agy-icon-btn',
			attr: { 'aria-label': 'New session' }
		});
		setIcon(newSessionBtn, 'rotate-ccw');
		newSessionBtn.addEventListener('click', () => { void this.restartSession(); });

		// Settings Icon Button
		const settingsBtn = actionsGroup.createDiv({
			cls: 'clickable-icon agy-icon-btn',
			attr: { 'aria-label': 'Settings' }
		});
		setIcon(settingsBtn, 'settings');
		settingsBtn.addEventListener('click', () => this.openSettingsTab());
	}

	private buildToolbar(parent: HTMLElement): void {
		const toolbar = parent.createDiv({ cls: 'agy-toolbar' });

		const modelGroup = toolbar.createDiv({ cls: 'agy-toolbar-group is-model-group' });

		this.modelTriggerBtn = modelGroup.createEl('button', {
			cls: 'agy-model-trigger-btn',
			attr: {
				'type': 'button',
				'aria-label': 'Select AI model and reasoning effort'
			}
		});

		const iconSpan = this.modelTriggerBtn.createSpan({ cls: 'agy-model-trigger-icon' });
		setIcon(iconSpan, 'sliders-horizontal');

		this.modelTriggerLabel = this.modelTriggerBtn.createSpan({
			cls: 'agy-model-trigger-label',
			text: 'Select model...'
		});

		const chevronSpan = this.modelTriggerBtn.createSpan({ cls: 'agy-model-trigger-chevron' });
		setIcon(chevronSpan, 'chevron-down');

		this.modelTriggerBtn.addEventListener('click', () => {
			this.openModelSelector();
		});

		// Refresh models button
		this.refreshModelsBtn = modelGroup.createDiv({
			cls: 'clickable-icon agy-refresh-btn',
			attr: { 'aria-label': 'Refresh models from CLI' }
		});
		setIcon(this.refreshModelsBtn, 'refresh-cw');
		this.refreshModelsBtn.addEventListener('click', () => { void this.refreshAvailableModels(true); });
	}

	public updateModelSelectionFromSettings(): void {
		const settings = this.getSettings();
		const provId = settings.activeProvider || 'antigravity';
		const provConfig = settings.providers?.[provId];

		const models = provConfig?.cachedModels || [];
		const currentModelId = provConfig?.selectedModel || models[0]?.id || '';
		const modelDef = models.find(m => m.id === currentModelId || currentModelId.startsWith(m.id));
		const label = modelDef ? modelDef.label : (currentModelId || 'No model selected');

		let effortStr = '';
		if (modelDef && modelDef.efforts && modelDef.efforts.length > 1) {
			const effort = provConfig?.modelEfforts?.[modelDef.id] || modelDef.defaultEffort || 'Medium';
			effortStr = ` (${effort})`;
		}

		if (this.modelTriggerLabel) {
			this.modelTriggerLabel.setText(`${label}${effortStr}`);
		}
	}

	private async refreshAvailableModels(showNotice = true): Promise<void> {
		this.refreshModelsBtn.addClass('is-spinning');
		try {
			const fetched = await this.cliService.fetchAvailableModels();
			if (fetched && fetched.length > 0) {
				this.updateModelSelectionFromSettings();
				if (showNotice) {
					new Notice(`Loaded ${fetched.length} models.`);
				}
			} else {
				if (showNotice) {
					new Notice('No models found from active provider.');
				}
			}
		} catch {
			if (showNotice) {
				new Notice('Could not refresh models from CLI.');
			}
		} finally {
			this.refreshModelsBtn.removeClass('is-spinning');
		}
	}

	private buildMessageList(parent: HTMLElement): void {
		this.messagesContainerEl = parent.createDiv({ cls: 'agy-messages-container' });
		this.renderEmptyState();
	}

	private renderEmptyState(): void {
		this.messagesContainerEl.empty();
		const emptyDiv = this.messagesContainerEl.createDiv({ cls: 'agy-empty-state' });

		const icon = emptyDiv.createDiv({ cls: 'agy-empty-icon' });
		setIcon(icon, 'messages-square');

		emptyDiv.createDiv({
			cls: 'agy-empty-title',
			text: 'No messages yet'
		});

		emptyDiv.createDiv({
			cls: 'agy-empty-desc',
			text: 'Type a message below or pick a quick action to start chatting with your local AI CLI.'
		});
	}

	private buildQuickActions(parent: HTMLElement): void {
		const quickActionsBar = parent.createDiv({ cls: 'agy-quick-actions' });

		const actions = [
			{ label: 'Summarize', prompt: 'Please summarize this note cleanly with key bullet points.' },
			{ label: 'Polish writing', prompt: 'Please review and polish this text for clarity, grammar, and flow while keeping my original voice.' },
			{ label: 'Extract tasks', prompt: 'Extract all action items, decisions, and todos from this note formatted as an Obsidian markdown task list.' },
			{ label: 'Explain concepts', prompt: 'Explain the core ideas and concepts discussed in this note clearly and concisely.' }
		];

		for (const action of actions) {
			const chip = quickActionsBar.createEl('button', {
				cls: 'agy-chip-btn',
				text: action.label,
				attr: { 'type': 'button' }
			});
			chip.addEventListener('click', () => {
				this.inputEl.value = action.prompt;
				void this.handleSend();
			});
		}
	}

	private buildContextPill(parent: HTMLElement): void {
		this.contextPillEl = parent.createDiv({ cls: 'agy-context-container' });
		this.renderContextPill();
	}

	private renderContextPill(): void {
		this.contextPillEl.empty();

		if (!this.includeActiveNote || !this.currentActiveContext) {
			const detachedPill = this.contextPillEl.createDiv({ cls: 'agy-context-badge is-detached' });
			const icon = detachedPill.createSpan({ cls: 'agy-badge-icon' });
			setIcon(icon, 'file-text');
			detachedPill.createSpan({ text: 'Note detached (click to link active note)' });
			detachedPill.addEventListener('click', () => {
				this.includeActiveNote = true;
				this.updateActiveDocumentContext();
			});
			return;
		}

		const badge = this.contextPillEl.createDiv({ cls: 'agy-context-badge' });
		const fileIcon = badge.createSpan({ cls: 'agy-badge-icon' });
		setIcon(fileIcon, 'file-text');

		const title = this.currentActiveContext.title;
		const selectionText = this.currentActiveContext.selection
			? `${title} (selection)`
			: title;

		badge.createSpan({ cls: 'agy-badge-title', text: selectionText });

		const dismissBtn = badge.createSpan({
			cls: 'agy-badge-dismiss',
			attr: { 'aria-label': 'Detach active note' }
		});
		setIcon(dismissBtn, 'x');
		dismissBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.includeActiveNote = false;
			this.renderContextPill();
		});
	}

	private buildInputArea(parent: HTMLElement): void {
		const inputSection = parent.createDiv({ cls: 'agy-input-section' });
		const inputWrapper = inputSection.createDiv({ cls: 'agy-input-container' });

		this.inputEl = inputWrapper.createEl('textarea', {
			cls: 'agy-textarea',
			attr: {
				placeholder: 'Ask Sidecar AI... (Enter to send, Shift+Enter for newline)',
				rows: '1'
			}
		});

		this.inputEl.addEventListener('input', () => {
			this.inputEl.setCssStyles({ height: 'auto' });
			this.inputEl.setCssStyles({ height: `${Math.min(this.inputEl.scrollHeight, 180)}px` });
		});

		this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				void this.handleSend();
			}
		});

		this.sendBtnEl = inputWrapper.createEl('button', {
			cls: 'agy-submit-btn',
			attr: {
				'aria-label': 'Send prompt',
				'type': 'button'
			}
		});
		setIcon(this.sendBtnEl, 'arrow-up');

		this.sendBtnEl.addEventListener('click', () => {
			if (this.isStreaming) {
				this.cliService.abort();
			} else {
				void this.handleSend();
			}
		});
	}

	public updateActiveDocumentContext(): void {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			this.currentActiveContext = null;
			this.renderContextPill();
			return;
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		let selection = '';

		if (activeView && activeView.editor) {
			selection = activeView.editor.getSelection().trim();
		}

		let fullPath = activeFile.path;
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			fullPath = adapter.getFullPath(activeFile.path);
		}

		this.currentActiveContext = {
			path: activeFile.path,
			fullPath,
			title: activeFile.basename,
			selection: selection.length > 0 ? selection : undefined
		};

		this.includeActiveNote = this.getSettings().autoAttachActiveNote;
		this.renderContextPill();
	}

	public restartSession(): void {
		this.cliService.resetSession();
		this.updateSessionBadge('');
		this.clearMessages();
		new Notice('Session reset.');
	}

	private updateSessionBadge(text: string): void {
		if (this.sessionBadgeEl) {
			if (text) {
				this.sessionBadgeEl.setText(text);
				this.sessionBadgeEl.setCssStyles({ display: 'inline-block' });
			} else {
				this.sessionBadgeEl.setText('');
				this.sessionBadgeEl.setCssStyles({ display: 'none' });
			}
		}
	}

	public clearMessages(): void {
		this.messages = [];
		this.renderEmptyState();
	}

	private async handleSend(): Promise<void> {
		if (this.isStreaming) {
			this.cliService.abort();
			this.isStreaming = false;
			this.setSendButtonState(false);
			return;
		}

		const userText = this.inputEl.value.trim();
		if (!userText) return;

		let noteContextPrefix = '';
		let attachedNotePath: string | undefined;
		let attachedNoteTitle: string | undefined;
		let attachedSelection: string | undefined;

		if (this.includeActiveNote && this.currentActiveContext) {
			const targetFilePath = this.currentActiveContext.fullPath || this.currentActiveContext.path;
			attachedNotePath = this.currentActiveContext.path;
			attachedNoteTitle = this.currentActiveContext.title;
			attachedSelection = this.currentActiveContext.selection;

			if (attachedSelection) {
				noteContextPrefix = `Regarding the selected text in file "${targetFilePath}":\n"""\n${attachedSelection}\n"""\n\n`;
			} else {
				noteContextPrefix = `Please read and analyze the file "${targetFilePath}":\n\n`;
			}
		}

		const fullPromptForCli = `${noteContextPrefix}${userText}`;

		// Clear input
		this.inputEl.value = '';
		this.inputEl.setCssStyles({ height: 'auto' });

		// Add user message
		const userMsg: ChatMessage = {
			id: String(Date.now()),
			role: 'user',
			content: userText,
			timestamp: Date.now(),
			attachedNotePath,
			attachedNoteTitle,
			attachedSelection
		};
		this.appendMessage(userMsg);

		// Provider and model info for this response
		const settings = this.getSettings();
		const provId = settings.activeProvider || 'antigravity';
		const provConfig = settings.providers?.[provId];
		const provName = PROVIDER_METADATA[provId]?.name || (provId === 'copilot' ? 'GitHub Copilot' : (provId === 'pi' ? 'Pi Coding Agent' : 'Google Antigravity'));

		const models = provConfig?.cachedModels || [];
		const currentModelId = provConfig?.selectedModel || models[0]?.id || '';
		const modelDef = models.find(m => m.id === currentModelId || currentModelId.startsWith(m.id));
		const currentModelLabel = modelDef ? modelDef.label : currentModelId;
		const currentEffort = (modelDef && modelDef.efforts && modelDef.efforts.length > 1)
			? (provConfig?.modelEfforts?.[currentModelId] || modelDef.defaultEffort || 'Medium')
			: undefined;

		// Prepare assistant streaming message
		const assistantMsg: ChatMessage = {
			id: String(Date.now() + 1),
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			providerId: provId,
			providerName: provName,
			modelLabel: currentModelLabel,
			effort: currentEffort,
			isStreaming: true
		};
		const assistantMsgEl = this.appendMessage(assistantMsg);

		this.isStreaming = true;
		this.setSendButtonState(true);

		let accumulatedResponse = '';

		await this.cliService.sendPrompt(fullPromptForCli, {
			onToken: (chunk: string) => {
				accumulatedResponse += chunk;
				assistantMsg.content = accumulatedResponse;
				this.updateAssistantMessageContent(assistantMsgEl, accumulatedResponse);
				this.scrollToBottom();
			},
			onConversationId: (id: string) => {
				this.updateSessionBadge(`ID: ${id.slice(0, 6)}`);
			},
			onComplete: (fullText: string, convId?: string) => {
				this.isStreaming = false;
				assistantMsg.isStreaming = false;
				assistantMsg.content = fullText || accumulatedResponse;
				this.updateAssistantMessageContent(assistantMsgEl, assistantMsg.content, true);
				this.setSendButtonState(false);
				if (convId) {
					this.updateSessionBadge(`ID: ${convId.slice(0, 6)}`);
				}
				this.scrollToBottom();
			},
			onError: (errorMsg: string) => {
				this.isStreaming = false;
				assistantMsg.isStreaming = false;
				assistantMsg.role = 'error';
				assistantMsg.content = `⚠️ **Error**: ${errorMsg}`;
				this.updateAssistantMessageContent(assistantMsgEl, assistantMsg.content, true);
				this.setSendButtonState(false);
				this.scrollToBottom();
			}
		});
	}

	private setSendButtonState(streaming: boolean): void {
		if (streaming) {
			this.sendBtnEl.addClass('is-stopping');
			this.sendBtnEl.setAttribute('aria-label', 'Stop generation');
			setIcon(this.sendBtnEl, 'square');
		} else {
			this.sendBtnEl.removeClass('is-stopping');
			this.sendBtnEl.setAttribute('aria-label', 'Send prompt');
			setIcon(this.sendBtnEl, 'arrow-up');
		}
	}

	private appendMessage(msg: ChatMessage): HTMLElement {
		if (this.messages.length === 0) {
			this.messagesContainerEl.empty();
		}
		this.messages.push(msg);

		const msgRow = this.messagesContainerEl.createDiv({
			cls: `agy-message is-${msg.role}`
		});

		// Header for user message
		if (msg.role === 'user') {
			const metaRow = msgRow.createDiv({ cls: 'agy-msg-meta' });
			metaRow.createSpan({ text: 'You', cls: 'agy-msg-author' });

			if (msg.attachedNotePath) {
				const displayTitle = msg.attachedNoteTitle || msg.attachedNotePath.split('/').pop()?.replace(/\.md$/, '') || msg.attachedNotePath;
				const fullTooltip = msg.attachedSelection
					? `${msg.attachedNotePath} (selection)`
					: msg.attachedNotePath;

				const contextBadge = metaRow.createSpan({
					cls: 'agy-msg-doc-ref',
					attr: { 'aria-label': fullTooltip }
				});
				const icon = contextBadge.createSpan({ cls: 'agy-msg-doc-icon' });
				setIcon(icon, 'file-text');

				const labelText = msg.attachedSelection
					? `${displayTitle} (selection)`
					: displayTitle;
				contextBadge.createSpan({ cls: 'agy-msg-doc-label', text: labelText });
			}

			const contentDiv = msgRow.createDiv({ cls: 'agy-user-content' });
			contentDiv.setText(msg.content);
		} else {
			const metaRow = msgRow.createDiv({ cls: 'agy-msg-meta' });
			const authorLabel = msg.providerName ? msg.providerName : 'Sidecar AI';
			metaRow.createSpan({ text: authorLabel, cls: 'agy-msg-author' });

			if (msg.modelLabel) {
				const modelBadge = metaRow.createSpan({ cls: 'agy-msg-model-badge' });
				const effortStr = msg.effort ? (' (' + msg.effort + ')') : '';
				modelBadge.setText(msg.modelLabel + effortStr);
			}

			const contentDiv = msgRow.createDiv({ cls: 'agy-assistant-content markdown-rendered' });
			this.renderMarkdownTo(contentDiv, msg.content);
		}

		this.scrollToBottom();
		return msgRow;
	}

	private updateAssistantMessageContent(msgRow: HTMLElement, content: string, isFinal = false): void {
		const contentDiv = msgRow.querySelector('.agy-assistant-content') as HTMLElement;
		if (!contentDiv) return;

		contentDiv.empty();
		this.renderMarkdownTo(contentDiv, content);

		if (isFinal) {
			this.attachCodeBlockActions(contentDiv);
		}
	}

	private renderMarkdownTo(targetEl: HTMLElement, markdownText: string): void {
		void MarkdownRenderer.render(
			this.app,
			markdownText || '...',
			targetEl,
			'',
			this
		);
	}

	private attachCodeBlockActions(container: HTMLElement): void {
		const preElements = container.querySelectorAll('pre');
		preElements.forEach((pre) => {
			if (pre.querySelector('.agy-code-toolbar')) return;

			const actionsBar = pre.createDiv({ cls: 'agy-code-toolbar' });

			// Copy button
			const copyBtn = actionsBar.createEl('button', {
				text: 'Copy',
				cls: 'agy-code-btn'
			});
			copyBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const code = pre.querySelector('code')?.innerText || pre.innerText;
				void navigator.clipboard.writeText(code);
				copyBtn.setText('Copied');
				window.setTimeout(() => copyBtn.setText('Copy'), 2000);
			});

			// Insert into Note button
			const insertBtn = actionsBar.createEl('button', {
				text: 'Insert into note',
				cls: 'agy-code-btn'
			});
			insertBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const code = pre.querySelector('code')?.innerText || pre.innerText;
				this.insertTextIntoActiveNote(code);
			});
		});
	}

	public insertTextIntoActiveNote(textToInsert: string): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || !activeView.editor) {
			new Notice('No active note editor found.');
			return;
		}

		const editor = activeView.editor;
		const cursor = editor.getCursor();
		editor.replaceRange(`\n${textToInsert}\n`, cursor);
		new Notice('Inserted into note');
	}

	private scrollToBottom(): void {
		if (this.getSettings().autoScrollChat && this.messagesContainerEl) {
			this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
		}
	}

	async onClose(): Promise<void> {
		this.cliService.abort();
	}
}


