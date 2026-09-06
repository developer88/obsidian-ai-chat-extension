export type AiProviderId = 'antigravity' | 'copilot' | 'pi';

export interface ModelDefinition {
	id: string;
	label: string;
	efforts: string[]; // e.g. ['Low', 'Medium', 'High'] or empty [] if not applicable
	defaultEffort?: string;
	effortModelMap?: Record<string, string>; // e.g. { 'low': 'gemini-3.8-flash-low', 'medium': 'gemini-3.8-flash-medium' }
}

export interface ProviderConfig {
	id: AiProviderId;
	name: string;
	cliCommand: string;
	useWsl: boolean;
	extraCliFlags: string;
	selectedModel: string;
	modelEfforts: Record<string, string>;
	cachedModels: ModelDefinition[];
	defaultMode: string;
	conversationId: string | null;
}

export const ANTIGRAVITY_MODELS: ModelDefinition[] = [
	{
		id: 'gemini-3.8-flash',
		label: 'Gemini 3.8 Flash',
		efforts: ['Low', 'Medium', 'High'],
		defaultEffort: 'Medium',
		effortModelMap: {
			'low': 'gemini-3.8-flash-low',
			'medium': 'gemini-3.8-flash-medium',
			'high': 'gemini-3.8-flash-high'
		}
	},
	{
		id: 'gemini-3.7-flash',
		label: 'Gemini 3.7 Flash',
		efforts: ['Low', 'Medium', 'High'],
		defaultEffort: 'Medium',
		effortModelMap: {
			'low': 'gemini-3.7-flash-low',
			'medium': 'gemini-3.7-flash-medium',
			'high': 'gemini-3.7-flash-high'
		}
	},
	{
		id: 'gemini-3.6-flash',
		label: 'Gemini 3.6 Flash',
		efforts: ['Low', 'Medium', 'High'],
		defaultEffort: 'Medium',
		effortModelMap: {
			'low': 'gemini-3.6-flash-low',
			'medium': 'gemini-3.6-flash-medium',
			'high': 'gemini-3.6-flash-high'
		}
	},
	{
		id: 'gemini-3.1-pro',
		label: 'Gemini 3.1 Pro',
		efforts: ['Low', 'High'],
		defaultEffort: 'Low',
		effortModelMap: {
			'low': 'gemini-3.1-pro-low',
			'high': 'gemini-3.1-pro-high'
		}
	},
	{
		id: 'claude-sonnet-4-6',
		label: 'Claude Sonnet 4.6 (Thinking)',
		efforts: [],
		effortModelMap: {}
	},
	{
		id: 'claude-opus-4-6-thinking',
		label: 'Claude Opus 4.6 (Thinking)',
		efforts: [],
		effortModelMap: {}
	},
	{
		id: 'gpt-oss-120b',
		label: 'GPT-OSS 120B',
		efforts: ['Medium'],
		defaultEffort: 'Medium',
		effortModelMap: {
			'medium': 'gpt-oss-120b-medium'
		}
	}
];

export const PI_DEFAULT_MODELS: ModelDefinition[] = [
	{
		id: 'gemini-3.1-pro-preview',
		label: 'Gemini 3.1 Pro Preview (Google)',
		efforts: ['Off', 'Low', 'Medium', 'High', 'Max'],
		defaultEffort: 'High'
	},
	{
		id: 'gemini-2.5-pro',
		label: 'Gemini 2.5 Pro (Google)',
		efforts: ['Off', 'Low', 'Medium', 'High', 'Max'],
		defaultEffort: 'High'
	},
	{
		id: 'gemini-2.5-flash',
		label: 'Gemini 2.5 Flash (Google)',
		efforts: ['Off', 'Low', 'Medium', 'High', 'Max'],
		defaultEffort: 'High'
	},
	{
		id: 'claude-3-7-sonnet',
		label: 'Claude 3.7 Sonnet (Anthropic)',
		efforts: ['Off', 'Low', 'Medium', 'High', 'Max'],
		defaultEffort: 'High'
	},
	{
		id: 'claude-3-5-sonnet',
		label: 'Claude 3.5 Sonnet (Anthropic)',
		efforts: []
	},
	{
		id: 'gpt-4o',
		label: 'GPT-4o (OpenAI)',
		efforts: []
	}
];

export const PROVIDER_METADATA: Record<AiProviderId, { name: string; defaultCmd: string }> = {
	antigravity: {
		name: 'Google Antigravity',
		defaultCmd: 'agy'
	},
	copilot: {
		name: 'GitHub Copilot',
		defaultCmd: 'copilot'
	},
	pi: {
		name: 'Pi Coding Agent',
		defaultCmd: 'pi'
	}
};

export interface AiChatPluginSettings {
	activeProvider: AiProviderId;
	providers: Record<AiProviderId, ProviderConfig>;
	autoAttachActiveNote: boolean;
	autoIncludeSelection: boolean;
	autoScrollChat: boolean;
	showStatusBarItem: boolean;
	hasAcceptedProcessExecutionDisclaimer?: boolean;

	// Legacy backward-compatibility fields (migrated to active provider)
	cliCommand?: string;
	useWsl?: boolean;
	selectedModel?: string;
	modelEfforts?: Record<string, string>;
	cachedModels?: ModelDefinition[];
	defaultMode?: string;
	extraCliFlags?: string;
	conversationId?: string | null;
}

export const DEFAULT_PROVIDER_CONFIGS: Record<AiProviderId, ProviderConfig> = {
	antigravity: {
		id: 'antigravity',
		name: 'Google Antigravity',
		cliCommand: 'agy',
		useWsl: false,
		extraCliFlags: '',
		selectedModel: 'gemini-3.8-flash',
		modelEfforts: {
			'gemini-3.8-flash': 'Medium',
			'gemini-3.7-flash': 'Medium',
			'gemini-3.6-flash': 'Medium',
			'gemini-3.1-pro': 'Low',
			'gpt-oss-120b': 'Medium'
		},
		cachedModels: ANTIGRAVITY_MODELS,
		defaultMode: '',
		conversationId: null
	},
	copilot: {
		id: 'copilot',
		name: 'GitHub Copilot',
		cliCommand: 'copilot',
		useWsl: false,
		extraCliFlags: '',
		selectedModel: '',
		modelEfforts: {},
		cachedModels: [],
		defaultMode: '',
		conversationId: null
	},
	pi: {
		id: 'pi',
		name: 'Pi Coding Agent',
		cliCommand: 'pi',
		useWsl: false,
		extraCliFlags: '',
		selectedModel: 'gemini-3.1-pro-preview',
		modelEfforts: {
			'gemini-3.1-pro-preview': 'High'
		},
		cachedModels: PI_DEFAULT_MODELS,
		defaultMode: '',
		conversationId: null
	}
};

export const DEFAULT_SETTINGS: AiChatPluginSettings = {
	activeProvider: 'antigravity',
	providers: DEFAULT_PROVIDER_CONFIGS,
	autoAttachActiveNote: true,
	autoIncludeSelection: true,
	autoScrollChat: true,
	showStatusBarItem: true,
	hasAcceptedProcessExecutionDisclaimer: false
};

export type MessageRole = 'user' | 'assistant' | 'system' | 'error';

export interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	timestamp: number;
	attachedNotePath?: string;
	attachedNoteTitle?: string;
	attachedSelection?: string;
	providerId?: AiProviderId;
	providerName?: string;
	modelLabel?: string;
	effort?: string;
	isStreaming?: boolean;
}

export interface ActiveNoteContext {
	path: string;
	fullPath?: string;
	title: string;
	content?: string;
	selection?: string;
	startLine?: number;
	endLine?: number;
}

export interface CliStreamCallbacks {
	onToken?: (token: string) => void;
	onConversationId?: (id: string) => void;
	onComplete?: (fullText: string, conversationId?: string) => void;
	onError?: (error: string) => void;
}
