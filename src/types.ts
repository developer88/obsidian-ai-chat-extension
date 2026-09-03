export interface ModelDefinition {
	id: string;
	label: string;
	efforts: string[]; // e.g. ['Low', 'Medium', 'High'] or empty [] if not applicable
	defaultEffort?: string;
	effortModelMap?: Record<string, string>; // e.g. { 'low': 'gemini-3.8-flash-low', 'medium': 'gemini-3.8-flash-medium' }
}

export const ANTIGRAVITY_2_MODELS: ModelDefinition[] = [
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

export interface AntigravityPluginSettings {
	cliCommand: string;
	useWsl: boolean;
	autoAttachActiveNote: boolean;
	autoIncludeSelection: boolean;
	selectedModel: string;
	modelEfforts: Record<string, string>; // Remembers effort per model
	cachedModels: ModelDefinition[];
	defaultMode: string;
	extraCliFlags: string;
	autoScrollChat: boolean;
	conversationId: string | null;
}

export const DEFAULT_SETTINGS: AntigravityPluginSettings = {
	cliCommand: 'agy',
	useWsl: false,
	autoAttachActiveNote: true,
	autoIncludeSelection: true,
	selectedModel: 'gemini-3.8-flash',
	modelEfforts: {
		'gemini-3.8-flash': 'Medium',
		'gemini-3.7-flash': 'Medium',
		'gemini-3.6-flash': 'Medium',
		'gemini-3.1-pro': 'Low',
		'gpt-oss-120b': 'Medium'
	},
	cachedModels: ANTIGRAVITY_2_MODELS,
	defaultMode: '',
	extraCliFlags: '',
	autoScrollChat: true,
	conversationId: null,
};

export type MessageRole = 'user' | 'assistant' | 'system' | 'error';

export interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	timestamp: number;
	attachedNotePath?: string;
	attachedSelection?: string;
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

