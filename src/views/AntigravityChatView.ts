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
	AntigravityPluginSettings,
	ChatMessage,
	ActiveNoteContext,
	ModelDefinition,
	ANTIGRAVITY_2_MODELS
} from '../types';
import { AgyCliService } from '../services/AgyCliService';

export const ANTIGRAVITY_CHAT_VIEW_TYPE = 'antigravity-chat-view';

export class AntigravityChatView extends ItemView {
	private messages: ChatMessage[] = [];
	private messagesContainerEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtnEl!: HTMLButtonElement;
	private contextPillEl!: HTMLElement;
	private modelSelectEl!: HTMLSelectElement;
	private effortSelectEl!: HTMLSelectElement;
	private effortGroupEl!: HTMLElement;
	private sessionBadgeEl!: HTMLElement;
	private refreshModelsBtn!: HTMLElement;
	private isStreaming = false;
	private includeActiveNote = true;
	private currentActiveContext: ActiveNoteContext | null = null;
	private modelOptions: ModelDefinition[] = ANTIGRAVITY_2_MODELS;

	constructor(
		leaf: WorkspaceLeaf,
		private cliService: AgyCliService,
		private getSettings: () => AntigravityPluginSettings,
		private saveSettings: (settings: AntigravityPluginSettings) => Promise<void>,
		private openSettingsTab: () => void
	) {
		super(leaf);
		const cached = this.getSettings().cachedModels;
		this.modelOptions = cached && cached.length > 0 ? cached : ANTIGRAVITY_2_MODELS;
	}

	getViewType(): string {
		return ANTIGRAVITY_CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Antigravity AI';
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

		// Initial active document sync
		this.updateActiveDocumentContext();

		// Fetch latest available models in background from CLI
		this.refreshAvailableModels(false);

		// Register workspace listeners for document changes
		this.registerEvent(
			this.app.workspace.on('file-open', () => this.updateActiveDocumentContext())
		);
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => this.updateActiveDocumentContext())
		);
	}

	private buildHeader(parent: HTMLElement): void {
		const header = parent.createDiv({ cls: 'agy-header' });

		const titleGroup = header.createDiv({ cls: 'agy-title-group' });
		const titleIcon = titleGroup.createSpan({ cls: 'agy-title-icon' });
		setIcon(titleIcon, 'cpu');
		titleGroup.createEl('span', { text: 'Antigravity AI', cls: 'agy-title-text' });

		// Subtle conversation ID indicator
		const convId = this.cliService.getConversationId();
		this.sessionBadgeEl = titleGroup.createSpan({
			cls: 'agy-session-badge',
			text: convId ? `ID: ${convId.slice(0, 6)}` : ''
		});
		if (!convId) {
			this.sessionBadgeEl.style.display = 'none';
		}

		const actionsGroup = header.createDiv({ cls: 'agy-header-actions' });

		// "New Session" Button
		const newSessionBtn = actionsGroup.createEl('button', {
			cls: 'agy-btn agy-btn-secondary',
			attr: { 'aria-label': 'Start new conversation session' }
		});
		const btnIcon = newSessionBtn.createSpan({ cls: 'agy-btn-icon' });
		setIcon(btnIcon, 'rotate-ccw');
		newSessionBtn.createSpan({ text: 'New Session' });
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
			attr: { 'aria-label': 'Antigravity settings' }
		});
		setIcon(settingsBtn, 'settings');
		settingsBtn.addEventListener('click', () => this.openSettingsTab());
	}

	private buildToolbar(parent: HTMLElement): void {
		const toolbar = parent.createDiv({ cls: 'agy-toolbar' });

		// Model Selector
		const modelGroup = toolbar.createDiv({ cls: 'agy-toolbar-group is-model-group' });
		const modelSelectWrapper = modelGroup.createDiv({ cls: 'agy-select-wrapper' });
		this.modelSelectEl = modelSelectWrapper.createEl('select', { cls: 'dropdown agy-select' });

		// Refresh models button
		this.refreshModelsBtn = modelGroup.createDiv({
			cls: 'clickable-icon agy-refresh-btn',
			attr: { 'aria-label': 'Refresh models from CLI' }
		});
		setIcon(this.refreshModelsBtn, 'refresh-cw');
		this.refreshModelsBtn.addEventListener('click', () => this.refreshAvailableModels(true));

		// Reasoning / Thinking Effort Selector Group (hidden by default)
		this.effortGroupEl = toolbar.createDiv({ cls: 'agy-toolbar-group is-effort-group' });
		this.effortGroupEl.style.display = 'none';

		const effortSelectWrapper = this.effortGroupEl.createDiv({ cls: 'agy-select-wrapper' });
		this.effortSelectEl = effortSelectWrapper.createEl('select', { cls: 'dropdown agy-select agy-effort-select' });

		// Populate models and bind handlers
		this.populateModelOptions(this.modelOptions);

		this.modelSelectEl.addEventListener('change', async () => {
			const selectedId = this.modelSelectEl.value;
			const settings = this.getSettings();
			settings.selectedModel = selectedId;
			await this.saveSettings(settings);

			this.updateEffortDropdownForSelectedModel();

			const selectedModelObj = this.modelOptions.find(m => m.id === selectedId);
			const label = selectedModelObj ? selectedModelObj.label : selectedId;
			new Notice(`Model: ${label}`);
		});

		this.effortSelectEl.addEventListener('change', async () => {
			const currentModelId = this.modelSelectEl.value;
			const selectedEffort = this.effortSelectEl.value;
			const settings = this.getSettings();
			
			if (!settings.modelEfforts) {
				settings.modelEfforts = {};
			}
			settings.modelEfforts[currentModelId] = selectedEffort;
			await this.saveSettings(settings);

			new Notice(`Effort: ${selectedEffort}`);
		});
	}

	private populateModelOptions(models: ModelDefinition[]): void {
		this.modelOptions = models && models.length > 0 ? models : ANTIGRAVITY_2_MODELS;
		this.modelSelectEl.empty();

		const settings = this.getSettings();
		const currentSelected = settings.selectedModel;
		let matchingModel = this.modelOptions.find(m => m.id === currentSelected || currentSelected?.startsWith(m.id));

		if (!matchingModel && this.modelOptions.length > 0) {
			matchingModel = this.modelOptions[0];
			settings.selectedModel = matchingModel.id;
			this.saveSettings(settings);
		}

		for (const model of this.modelOptions) {
			const option = this.modelSelectEl.createEl('option', {
				value: model.id,
				text: model.label
			});
			if (matchingModel && model.id === matchingModel.id) {
				option.selected = true;
			}
		}

		this.updateEffortDropdownForSelectedModel();
	}

	private updateEffortDropdownForSelectedModel(): void {
		const currentModelId = this.modelSelectEl.value;
		const model = this.modelOptions.find(m => m.id === currentModelId);

		// Hide effort selector if model has <= 1 effort option
		if (!model || !model.efforts || model.efforts.length <= 1) {
			this.effortGroupEl.style.display = 'none';
			return;
		}

		this.effortGroupEl.style.display = 'flex';
		this.effortSelectEl.empty();

		const settings = this.getSettings();
		const savedEffort = settings.modelEfforts?.[currentModelId] || model.defaultEffort || 'Medium';

		for (const effort of model.efforts) {
			const opt = this.effortSelectEl.createEl('option', {
				value: effort,
				text: effort
			});
			if (effort.toLowerCase() === savedEffort.toLowerCase()) {
				opt.selected = true;
			}
		}
	}

	private async refreshAvailableModels(showNotice = true): Promise<void> {
		this.refreshModelsBtn.addClass('is-spinning');
		try {
			const fetched = await this.cliService.fetchAvailableModels();
			if (fetched && fetched.length > 0) {
				this.populateModelOptions(fetched);
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
		const emptyEl = this.messagesContainerEl.createDiv({ cls: 'agy-empty-state' });
		
		const iconEl = emptyEl.createDiv({ cls: 'agy-empty-icon' });
		setIcon(iconEl, 'terminal');

		emptyEl.createEl('div', { text: 'Antigravity Session', cls: 'agy-empty-title' });
		emptyEl.createEl('p', {
			text: 'Connected to local Antigravity CLI via Google AI Pro subscription.',
			cls: 'agy-empty-subtitle'
		});

		const guideBox = emptyEl.createDiv({ cls: 'agy-guide-box' });
		const row1 = guideBox.createDiv({ cls: 'agy-guide-row' });
		const kbd1 = row1.createEl('kbd', { text: 'Enter' });
		row1.createSpan({ text: ' to send prompt' });

		const row2 = guideBox.createDiv({ cls: 'agy-guide-row' });
		const kbd2 = row2.createEl('kbd', { text: 'Shift+Enter' });
		row2.createSpan({ text: ' for new line' });

		const row3 = guideBox.createDiv({ cls: 'agy-guide-row' });
		row3.createSpan({ text: 'Active vault note links automatically below' });
	}

	private buildQuickActions(parent: HTMLElement): void {
		const quickBar = parent.createDiv({ cls: 'agy-quick-actions' });

		const actions = [
			{ label: 'Summarize', prompt: 'Provide a concise, structured summary with key takeaways of this note.' },
			{ label: 'Polish writing', prompt: 'Review and refine the writing in this note for clarity, flow, and tone while preserving its core meaning.' },
			{ label: 'Extract tasks', prompt: 'Extract all action items, todos, and open questions from this note.' },
			{ label: 'Explain concepts', prompt: 'Explain the core concepts discussed in this note and suggest related ideas.' },
		];

		for (const action of actions) {
			const btn = quickBar.createEl('button', {
				text: action.label,
				cls: 'agy-action-chip'
			});
			btn.addEventListener('click', () => {
				this.sendQuickPrompt(action.prompt);
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
			? ` (${this.currentActiveContext.selection.split('\n').length} lines)`
			: '';

		badge.createSpan({
			text: `${title}${selectionText}`,
			cls: 'agy-badge-title'
		});

		const closeBtn = badge.createDiv({
			cls: 'clickable-icon agy-badge-dismiss',
			attr: { 'aria-label': 'Detach document' }
		});
		setIcon(closeBtn, 'x');
		closeBtn.addEventListener('click', (e) => {
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
				placeholder: 'Ask Antigravity... (Enter to send, Shift+Enter for newline)',
				rows: '1'
			}
		});

		// Auto-expand textarea
		this.inputEl.addEventListener('input', () => {
			this.inputEl.style.height = 'auto';
			this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 180) + 'px';
		});

		// Keydown handlers
		this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.handleSend();
			}
		});

		this.sendBtnEl = inputWrapper.createEl('button', {
			cls: 'clickable-icon agy-submit-btn',
			attr: { 'aria-label': 'Send prompt' }
		});
		setIcon(this.sendBtnEl, 'arrow-up');
		this.sendBtnEl.addEventListener('click', () => this.handleSend());
	}

	public updateActiveDocumentContext(): void {
		const activeFile = this.app.workspace.getActiveFile();
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (!activeFile) {
			this.currentActiveContext = null;
			this.renderContextPill();
			return;
		}

		let selection = '';
		if (activeView && activeView.editor) {
			selection = activeView.editor.getSelection();
		}

		let fullPath = activeFile.path;
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			fullPath = adapter.getFullPath(activeFile.path);
		}

		if (this.getSettings().useWsl) {
			fullPath = this.cliService.toWslPath(fullPath);
		}

		this.currentActiveContext = {
			path: activeFile.path,
			fullPath: fullPath,
			title: activeFile.basename,
			selection: selection.trim() || undefined
		};

		this.renderContextPill();
	}

	public restartSession(): void {
		this.cliService.resetSession();
		this.messages = [];
		this.renderEmptyState();
		this.updateSessionBadge('');
		new Notice('Session reset.');
	}

	public clearMessages(): void {
		this.messages = [];
		this.renderEmptyState();
	}

	private updateSessionBadge(text: string): void {
		if (this.sessionBadgeEl) {
			if (text) {
				this.sessionBadgeEl.setText(text);
				this.sessionBadgeEl.style.display = 'inline-block';
			} else {
				this.sessionBadgeEl.setText('');
				this.sessionBadgeEl.style.display = 'none';
			}
		}
	}

	private sendQuickPrompt(promptText: string): void {
		this.inputEl.value = promptText;
		this.handleSend();
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

		// Attach active document full file path to prompt
		let noteContextPrefix = '';
		let attachedNotePath: string | undefined;
		let attachedSelection: string | undefined;

		if (this.includeActiveNote && this.currentActiveContext) {
			const targetFilePath = this.currentActiveContext.fullPath || this.currentActiveContext.path;
			attachedNotePath = this.currentActiveContext.path;
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

		// Prepare assistant streaming message
		const assistantMsg: ChatMessage = {
			id: String(Date.now() + 1),
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
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
			metaRow.createSpan({ text: 'Antigravity', cls: 'agy-msg-author' });

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
		MarkdownRenderer.render(
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

			const actionsBar = document.createElement('div');
			actionsBar.className = 'agy-code-toolbar';

			// Copy button
			const copyBtn = actionsBar.createEl('button', {
				text: 'Copy',
				cls: 'agy-code-btn'
			});
			copyBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const code = pre.querySelector('code')?.innerText || pre.innerText;
				navigator.clipboard.writeText(code);
				copyBtn.setText('Copied');
				setTimeout(() => copyBtn.setText('Copy'), 2000);
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

			pre.appendChild(actionsBar);
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
		if (this.getSettings().autoScrollChat) {
			this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
		}
	}

	async onClose(): Promise<void> {
		this.cliService.abort();
	}
}
