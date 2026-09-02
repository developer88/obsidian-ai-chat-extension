import {
	ItemView,
	WorkspaceLeaf,
	MarkdownRenderer,
	MarkdownView,
	setIcon,
	Notice,
	TFile,
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
		setIcon(titleIcon, 'sparkles');
		titleGroup.createEl('h4', { text: 'Antigravity AI', cls: 'agy-title-text' });

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

		// Explicit interactive "New Session" Button
		const newSessionBtn = actionsGroup.createEl('button', {
			cls: 'agy-new-session-btn',
			attr: { 'aria-label': 'Start a clean session' }
		});
		const btnIcon = newSessionBtn.createSpan({ cls: 'agy-btn-icon' });
		setIcon(btnIcon, 'rotate-ccw');
		newSessionBtn.createSpan({ text: 'New Session' });
		newSessionBtn.addEventListener('click', () => this.restartSession());

		// Clear Messages Button
		new ExtraButtonComponent(actionsGroup)
			.setIcon('trash-2')
			.setTooltip('Clear Chat Messages')
			.onClick(() => this.clearMessages());

		// Settings Button
		new ExtraButtonComponent(actionsGroup)
			.setIcon('settings')
			.setTooltip('Antigravity Settings')
			.onClick(() => this.openSettingsTab());
	}

	private buildToolbar(parent: HTMLElement): void {
		const toolbar = parent.createDiv({ cls: 'agy-toolbar' });

		// Model Selector Group
		const modelGroup = toolbar.createDiv({ cls: 'agy-toolbar-group is-model-group' });
		const brainIcon = modelGroup.createSpan({ cls: 'agy-toolbar-icon' });
		setIcon(brainIcon, 'cpu');

		this.modelSelectEl = modelGroup.createEl('select', { cls: 'agy-model-select' });

		// Refresh models button
		this.refreshModelsBtn = modelGroup.createSpan({ cls: 'agy-refresh-btn' });
		setIcon(this.refreshModelsBtn, 'refresh-cw');
		this.refreshModelsBtn.setAttribute('aria-label', 'Refresh models from CLI');
		this.refreshModelsBtn.addEventListener('click', () => this.refreshAvailableModels(true));

		// Reasoning / Thinking Effort Selector Group (hidden by default)
		this.effortGroupEl = toolbar.createDiv({ cls: 'agy-toolbar-group is-effort-group' });
		this.effortGroupEl.style.display = 'none'; // hidden by default

		const zapIcon = this.effortGroupEl.createSpan({ cls: 'agy-toolbar-icon' });
		setIcon(zapIcon, 'zap');

		this.effortSelectEl = this.effortGroupEl.createEl('select', { cls: 'agy-effort-select' });

		// Populate models and bind event handlers
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

		const currentModel = this.getSettings().selectedModel || this.modelOptions[0].id;
		let found = false;

		for (const model of this.modelOptions) {
			const option = this.modelSelectEl.createEl('option', {
				value: model.id,
				text: model.label
			});
			if (model.id === currentModel) {
				option.selected = true;
				found = true;
			}
		}

		if (!found && this.modelOptions.length > 0) {
			this.modelSelectEl.value = this.modelOptions[0].id;
			this.getSettings().selectedModel = this.modelOptions[0].id;
			this.saveSettings(this.getSettings());
		}

		this.updateEffortDropdownForSelectedModel();
	}

	private updateEffortDropdownForSelectedModel(): void {
		const currentModelId = this.modelSelectEl.value;
		const model = this.modelOptions.find(m => m.id === currentModelId);

		// Hide effort selector by default unless the model has selectable efforts
		if (!model || !model.efforts || model.efforts.length === 0) {
			this.effortGroupEl.style.display = 'none';
			return;
		}

		// Show effort selector and populate options with 'Medium' as default
		this.effortGroupEl.style.display = 'flex';
		this.effortSelectEl.empty();

		const settings = this.getSettings();
		const savedEffort = settings.modelEfforts?.[currentModelId] || 'Medium';

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
				new Notice('Could not refresh models from CLI; using defaults.');
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
		setIcon(iconEl, 'bot');

		emptyEl.createEl('h3', { text: 'How can I assist your thinking?' });
		emptyEl.createEl('p', {
			text: 'Connected directly to Antigravity CLI with your Google AI Pro subscription. Vault notes and selections are linked automatically.',
			cls: 'agy-empty-desc'
		});

		const tips = emptyEl.createDiv({ cls: 'agy-tips-list' });
		tips.createDiv({ text: '📄 Active note context attaches automatically', cls: 'agy-tip-item' });
		tips.createDiv({ text: '🧠 Select model & reasoning effort in top bar', cls: 'agy-tip-item' });
		tips.createDiv({ text: '🔄 Click "New Session" anytime to reset memory', cls: 'agy-tip-item' });
		tips.createDiv({ text: '📥 Insert AI code snippets directly into your note', cls: 'agy-tip-item' });
	}

	private buildQuickActions(parent: HTMLElement): void {
		const quickBar = parent.createDiv({ cls: 'agy-quick-actions' });

		const actions = [
			{ label: '⚡ Summarize', prompt: 'Provide a concise, structured summary with key takeaways of this note.' },
			{ label: '✍️ Polish', prompt: 'Review and refine the writing in this note for clarity, flow, and tone while preserving its core meaning.' },
			{ label: '🔍 Tasks', prompt: 'Extract all action items, todos, and open questions from this note.' },
			{ label: '❓ Key Concepts', prompt: 'Explain the core concepts discussed in this note and suggest related ideas.' },
		];

		for (const action of actions) {
			const btn = quickBar.createEl('button', {
				text: action.label,
				cls: 'agy-quick-btn'
			});
			btn.addEventListener('click', () => {
				this.sendQuickPrompt(action.prompt);
			});
		}
	}

	private buildContextPill(parent: HTMLElement): void {
		this.contextPillEl = parent.createDiv({ cls: 'agy-context-pill-container' });
		this.renderContextPill();
	}

	private renderContextPill(): void {
		this.contextPillEl.empty();

		if (!this.includeActiveNote || !this.currentActiveContext) {
			const detachedPill = this.contextPillEl.createDiv({ cls: 'agy-context-pill is-detached' });
			const icon = detachedPill.createSpan({ cls: 'agy-pill-icon' });
			setIcon(icon, 'file-text');
			detachedPill.createSpan({ text: 'No note attached (click to attach)' });
			detachedPill.addEventListener('click', () => {
				this.includeActiveNote = true;
				this.updateActiveDocumentContext();
			});
			return;
		}

		const pill = this.contextPillEl.createDiv({ cls: 'agy-context-pill' });
		const fileIcon = pill.createSpan({ cls: 'agy-pill-icon' });
		setIcon(fileIcon, 'file-text');

		const title = this.currentActiveContext.title;
		const selectionText = this.currentActiveContext.selection
			? ` (${this.currentActiveContext.selection.split('\n').length} lines selected)`
			: '';

		pill.createSpan({
			text: `${title}${selectionText}`,
			cls: 'agy-pill-text'
		});

		const closeBtn = pill.createSpan({ cls: 'agy-pill-close' });
		setIcon(closeBtn, 'x');
		closeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.includeActiveNote = false;
			this.renderContextPill();
		});
	}

	private buildInputArea(parent: HTMLElement): void {
		const inputSection = parent.createDiv({ cls: 'agy-input-section' });

		const inputWrapper = inputSection.createDiv({ cls: 'agy-input-wrapper' });

		this.inputEl = inputWrapper.createEl('textarea', {
			cls: 'agy-textarea',
			attr: {
				placeholder: 'Ask Antigravity anything... (Enter to send, Shift+Enter for newline)',
				rows: '1'
			}
		});

		// Auto-expand textarea
		this.inputEl.addEventListener('input', () => {
			this.inputEl.style.height = 'auto';
			this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 160) + 'px';
		});

		// Keydown handlers
		this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.handleSend();
			}
		});

		this.sendBtnEl = inputWrapper.createEl('button', {
			cls: 'agy-send-btn',
			attr: { 'aria-label': 'Send Message' }
		});
		setIcon(this.sendBtnEl, 'send');
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

		this.currentActiveContext = {
			path: activeFile.path,
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
		new Notice('Antigravity session restarted.');
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

		// Read current note content if attached
		let noteContextPrefix = '';
		let attachedNotePath: string | undefined;
		let attachedSelection: string | undefined;

		if (this.includeActiveNote && this.currentActiveContext) {
			attachedNotePath = this.currentActiveContext.path;
			attachedSelection = this.currentActiveContext.selection;

			const file = this.app.vault.getAbstractFileByPath(this.currentActiveContext.path);
			if (file instanceof TFile) {
				try {
					const content = await this.app.vault.read(file);
					if (attachedSelection) {
						noteContextPrefix = `[Context from Note: ${file.path}]\n[Selected Text]:\n${attachedSelection}\n\n`;
					} else {
						noteContextPrefix = `[Context from Note: ${file.path}]\n--- Document Content ---\n${content}\n-----------------------\n\n`;
					}
				} catch (err) {
					console.warn('Could not read active note content:', err);
					noteContextPrefix = `[Active Note Path: ${file.path}]\n\n`;
				}
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
			this.sendBtnEl.setAttribute('aria-label', 'Stop Generation');
			setIcon(this.sendBtnEl, 'square');
		} else {
			this.sendBtnEl.removeClass('is-stopping');
			this.sendBtnEl.setAttribute('aria-label', 'Send Message');
			setIcon(this.sendBtnEl, 'send');
		}
	}

	private appendMessage(msg: ChatMessage): HTMLElement {
		if (this.messages.length === 0) {
			this.messagesContainerEl.empty();
		}
		this.messages.push(msg);

		const msgRow = this.messagesContainerEl.createDiv({
			cls: `agy-message-row is-${msg.role}`
		});

		const avatar = msgRow.createDiv({ cls: 'agy-avatar' });
		setIcon(avatar, msg.role === 'user' ? 'user' : 'bot');

		const bubble = msgRow.createDiv({ cls: 'agy-bubble' });

		// Attached context badge on user message
		if (msg.role === 'user' && msg.attachedNotePath) {
			const contextBadge = bubble.createDiv({ cls: 'agy-msg-context-badge' });
			const icon = contextBadge.createSpan();
			setIcon(icon, 'file-text');
			contextBadge.createSpan({
				text: msg.attachedSelection
					? `${msg.attachedNotePath} (selection)`
					: msg.attachedNotePath
			});
		}

		const contentDiv = bubble.createDiv({ cls: 'agy-markdown-content' });
		this.renderMarkdownTo(contentDiv, msg.content);

		this.scrollToBottom();
		return msgRow;
	}

	private updateAssistantMessageContent(msgRow: HTMLElement, content: string, isFinal = false): void {
		const contentDiv = msgRow.querySelector('.agy-markdown-content') as HTMLElement;
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
			if (pre.querySelector('.agy-code-actions')) return;

			const actionsBar = document.createElement('div');
			actionsBar.className = 'agy-code-actions';

			// Copy button
			const copyBtn = actionsBar.createEl('button', {
				text: 'Copy',
				cls: 'agy-code-btn'
			});
			copyBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const code = pre.querySelector('code')?.innerText || pre.innerText;
				navigator.clipboard.writeText(code);
				copyBtn.setText('Copied!');
				setTimeout(() => copyBtn.setText('Copy'), 2000);
			});

			// Insert into Active Note Button
			const insertBtn = actionsBar.createEl('button', {
				text: 'Insert into Note',
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
			new Notice('No active note editor found to insert text.');
			return;
		}

		const editor = activeView.editor;
		const cursor = editor.getCursor();
		editor.replaceRange(`\n${textToInsert}\n`, cursor);
		new Notice('Inserted into note!');
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
