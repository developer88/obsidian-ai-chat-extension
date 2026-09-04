import {
	ItemView,
	WorkspaceLeaf,
	MarkdownRenderer,
	MarkdownView,
	setIcon,
	Notice,
	TFile,
	FileSystemAdapter,
	ExtraButtonComponent
} from 'obsidian';
import {
	AiChatPluginSettings,
	ChatMessage,
	ActiveNoteContext,
	ModelDefinition,
	ANTIGRAVITY_MODELS,
	COPILOT_MODELS,
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
		return 'AI Chat';
	}

	getIcon(): string {
		return 'bot';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('agy-chat-root');

		this.includeActiveNote = this.getSettings().autoAttachActiveNote;

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

		const brand = header.createDiv({ cls: 'agy-brand' });
		const title = brand.createSpan({ text: 'AI Chat', cls: 'agy-title' });

		this.sessionBadgeEl = brand.createSpan({
			cls: 'agy-session-badge',
			text: 'New Session'
		});

		const actionsGroup = header.createDiv({ cls: 'agy-header-actions' });

		// New Session Action
		const newSessionBtn = actionsGroup.createEl('button', {
			cls: 'clickable-icon agy-icon-btn agy-new-session-btn',
			attr: {
				'aria-label': 'Start New Session (Clear context)',
				'type': 'button'
			}
		});
		setIcon(newSessionBtn, 'rotate-ccw');
		newSessionBtn.createSpan({ text: 'New', cls: 'agy-btn-label' });
		newSessionBtn.addEventListener('click', () => this.restartSession());

		// Clear Messages Action
		const clearBtn = actionsGroup.createEl('div', {
			cls: 'clickable-icon agy-icon-btn',
			attr: { 'aria-label': 'Clear chat' }
		});
		setIcon(clearBtn, 'trash-2');
		clearBtn.addEventListener('click', () => this.clearMessages());

		// Settings Action
		const settingsBtn = actionsGroup.createEl('div', {
			cls: 'clickable-icon agy-icon-btn',
			attr: { 'aria-label': 'AI Chat settings' }
		});
		setIcon(settingsBtn, 'settings');
		settingsBtn.addEventListener('click', () => this.openSettingsTab());
	}

	private buildToolbar(parent: HTMLElement): void {
		const toolbar = parent.createDiv({ cls: 'agy-toolbar' });

		// Model & Effort Selector Trigger Button
		const modelGroup = toolbar.createDiv({ cls: 'agy-toolbar-group is-model-group' });

		this.modelTriggerBtn = modelGroup.createEl('button', {
			cls: 'agy-model-trigger-btn',
			attr: {
				'type': 'button',
				'aria-label': 'Select AI Provider, Model, and Reasoning Effort'
			}
		});

		const iconSpan = this.modelTriggerBtn.createSpan({ cls: 'agy-model-trigger-icon' });
		setIcon(iconSpan, 'sparkles');

		this.modelTriggerLabel = this.modelTriggerBtn.createSpan({
			cls: 'agy-model-trigger-label',
			text: 'Select Model...'
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
		this.refreshModelsBtn.addEventListener('click', () => this.refreshAvailableModels(true));
	}

	public updateModelSelectionFromSettings(): void {
		const settings = this.getSettings();
		const provId = settings.activeProvider || 'antigravity';
		const provConfig = settings.providers?.[provId];
		const provName = provId === 'copilot' ? 'Copilot' : 'Antigravity';

		const models = (provConfig?.cachedModels && provConfig.cachedModels.length > 0)
			? provConfig.cachedModels
			: (provId === 'copilot' ? COPILOT_MODELS : ANTIGRAVITY_MODELS);

		const currentModelId = provConfig?.selectedModel || models[0]?.id || '';
		const modelDef = models.find(m => m.id === currentModelId || currentModelId.startsWith(m.id));
		const label = modelDef ? modelDef.label : currentModelId;

		let effortStr = '';
		if (modelDef && modelDef.efforts && modelDef.efforts.length > 1) {
			const effort = provConfig?.modelEfforts?.[modelDef.id] || modelDef.defaultEffort || 'Medium';
			effortStr = ` (${effort})`;
		}

		if (this.modelTriggerLabel) {
			this.modelTriggerLabel.setText(`${provName} • ${label}${effortStr}`);
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
			}
		} catch (e) {
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
		setIcon(icon, 'bot');

		emptyDiv.createEl('p', {
			cls: 'agy-empty-title',
			text: 'AI Chat for Obsidian'
		});

		emptyDiv.createEl('p', {
			cls: 'agy-empty-desc',
			text: 'Connected directly to your local AI CLI (Google Antigravity & GitHub Copilot) without API tokens.'
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
				this.handleSend();
			});
		}
	}

	private buildContextPill(parent: HTMLElement): void {
		this.contextPillEl = parent.createDiv({ cls: 'agy-context-container' });
		this.renderContextBadge();
	}

	private renderContextBadge(): void {
		this.contextPillEl.empty();

		if (!this.includeActiveNote || !this.currentActiveContext) {
			return;
		}

		const badge = this.contextPillEl.createDiv({ cls: 'agy-context-badge' });

		const icon = badge.createSpan({ cls: 'agy-badge-icon' });
		setIcon(icon, 'file-text');

		const noteName = this.currentActiveContext.title;
		let badgeText = noteName;
		if (this.currentActiveContext.selection) {
			badgeText = `${noteName} (selection)`;
		}

		badge.createSpan({ cls: 'agy-badge-text', text: badgeText });

		const dismissBtn = badge.createSpan({
			cls: 'agy-badge-dismiss clickable-icon',
			attr: { 'aria-label': 'Detach active note context' }
		});
		setIcon(dismissBtn, 'x');

		dismissBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.includeActiveNote = false;
			this.renderContextBadge();
			new Notice('Detached active note for this chat.');
		});
	}

	private buildInputArea(parent: HTMLElement): void {
		const footer = parent.createDiv({ cls: 'agy-footer' });
		const inputWrapper = footer.createDiv({ cls: 'agy-input-wrapper' });

		this.inputEl = inputWrapper.createEl('textarea', {
			cls: 'agy-textarea',
			attr: {
				placeholder: 'Ask anything about this note, or brainstorm ideas...',
				rows: '1'
			}
		});

		this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.handleSend();
			}
		});

		this.inputEl.addEventListener('input', () => {
			this.inputEl.style.height = 'auto';
			this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 180) + 'px';
		});

		this.sendBtnEl = inputWrapper.createEl('button', {
			cls: 'agy-send-btn',
			attr: {
				'type': 'button',
				'aria-label': 'Send prompt'
			}
		});
		setIcon(this.sendBtnEl, 'arrow-up');

		this.sendBtnEl.addEventListener('click', () => {
			if (this.isStreaming) {
				this.cliService.abort();
			} else {
				this.handleSend();
			}
		});
	}

	public updateActiveDocumentContext(): void {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			this.currentActiveContext = null;
			this.renderContextBadge();
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
		this.renderContextBadge();
	}

	public restartSession(): void {
		this.cliService.resetSession();
		this.updateSessionBadge('New Session');
		this.clearMessages();
		new Notice('Session restarted.');
	}

	private updateSessionBadge(text: string): void {
		if (this.sessionBadgeEl) {
			this.sessionBadgeEl.setText(text);
		}
	}

	public clearMessages(): void {
		this.messages = [];
		this.renderEmptyState();
	}

	private async handleSend(): Promise<void> {
		const userText = this.inputEl.value.trim();
		if (!userText || this.isStreaming) return;

		let noteContextPrefix = '';
		let attachedNotePath: string | undefined;
		let attachedSelection: string | undefined;

		if (this.includeActiveNote && this.currentActiveContext) {
			attachedNotePath = this.currentActiveContext.title;
			const targetPath = this.currentActiveContext.fullPath || this.currentActiveContext.path;

			if (this.currentActiveContext.selection) {
				attachedSelection = this.currentActiveContext.selection;
				noteContextPrefix = `Regarding file "${targetPath}" with selected text:\n"""\n${this.currentActiveContext.selection}\n"""\n\n`;
			} else {
				noteContextPrefix = `Please read and analyze the file "${targetPath}":\n\n`;
			}
		}

		const fullPromptForCli = `${noteContextPrefix}${userText}`;

		// Clear input
		this.inputEl.value = '';
		this.inputEl.style.height = 'auto';

		// Add user message
		const userMsg: ChatMessage = {
			id: String(Date.now()),
			role: 'user',
			content: userText,
			timestamp: Date.now(),
			attachedNotePath,
			attachedSelection
		};
		this.appendMessage(userMsg);

		// Provider and model info for this response
		const settings = this.getSettings();
		const provId = settings.activeProvider || 'antigravity';
		const provConfig = settings.providers?.[provId];
		const provName = PROVIDER_METADATA[provId]?.name || (provId === 'copilot' ? 'GitHub Copilot' : 'Google Antigravity');

		const models = (provConfig?.cachedModels && provConfig.cachedModels.length > 0)
			? provConfig.cachedModels
			: (provId === 'copilot' ? COPILOT_MODELS : ANTIGRAVITY_MODELS);

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
				const contextBadge = metaRow.createSpan({ cls: 'agy-msg-doc-ref' });
				const icon = contextBadge.createSpan();
				setIcon(icon, 'file-text');
				contextBadge.createSpan({
					text: msg.attachedSelection
						? `${msg.attachedNotePath} (selection)`
						: msg.attachedNotePath
				});
			}

			const contentDiv = msgRow.createDiv({ cls: 'agy-user-content' });
			contentDiv.setText(msg.content);
		} else {
			const metaRow = msgRow.createDiv({ cls: 'agy-msg-meta' });
			const authorLabel = msg.providerName ? msg.providerName : 'AI Chat';
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

		this.renderMarkdownTo(contentDiv, content);

		if (isFinal) {
			this.addMessageActionButtons(msgRow, content);
		}
	}

	private addMessageActionButtons(msgRow: HTMLElement, text: string): void {
		if (msgRow.querySelector('.agy-msg-actions')) return;

		const actionsRow = msgRow.createDiv({ cls: 'agy-msg-actions' });

		const copyBtn = actionsRow.createEl('button', {
			cls: 'agy-action-btn',
			attr: { 'type': 'button', 'aria-label': 'Copy full response' }
		});
		setIcon(copyBtn, 'copy');
		copyBtn.createSpan({ text: 'Copy' });
		copyBtn.addEventListener('click', async () => {
			await navigator.clipboard.writeText(text);
			new Notice('Response copied to clipboard.');
		});

		const insertBtn = actionsRow.createEl('button', {
			cls: 'agy-action-btn',
			attr: { 'type': 'button', 'aria-label': 'Insert into active note' }
		});
		setIcon(insertBtn, 'corner-down-left');
		insertBtn.createSpan({ text: 'Insert' });
		insertBtn.addEventListener('click', () => {
			this.insertTextIntoActiveNote(text);
		});
	}

	private insertTextIntoActiveNote(text: string): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && activeView.editor) {
			activeView.editor.replaceSelection(`\n\n${text}\n\n`);
			new Notice('Inserted into note.');
		} else {
			new Notice('No active note editor open to insert text.');
		}
	}

	private renderMarkdownTo(el: HTMLElement, markdownText: string): void {
		el.empty();
		MarkdownRenderer.renderMarkdown(
			markdownText,
			el,
			'',
			this
		).then(() => {
			this.enhanceCodeBlocks(el);
		});
	}

	private enhanceCodeBlocks(container: HTMLElement): void {
		const codeBlocks = container.querySelectorAll('pre');
		codeBlocks.forEach((pre) => {
			if (pre.querySelector('.agy-code-actions')) return;

			const actionsBar = document.createElement('div');
			actionsBar.className = 'agy-code-actions';

			const copyBtn = document.createElement('button');
			copyBtn.className = 'agy-code-btn';
			copyBtn.textContent = 'Copy';
			copyBtn.onclick = async (e) => {
				e.stopPropagation();
				const code = pre.querySelector('code')?.innerText || pre.innerText;
				await navigator.clipboard.writeText(code);
				copyBtn.textContent = 'Copied!';
				setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1800);
			};

			const insertBtn = document.createElement('button');
			insertBtn.className = 'agy-code-btn';
			insertBtn.textContent = 'Insert';
			insertBtn.onclick = (e) => {
				e.stopPropagation();
				const code = pre.querySelector('code')?.innerText || pre.innerText;
				this.insertTextIntoActiveNote(`\`\`\`\n${code}\n\`\`\``);
			};

			actionsBar.appendChild(copyBtn);
			actionsBar.appendChild(insertBtn);
			pre.style.position = 'relative';
			pre.appendChild(actionsBar);
		});
	}

	private scrollToBottom(): void {
		if (this.getSettings().autoScrollChat && this.messagesContainerEl) {
			this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
		}
	}
}
