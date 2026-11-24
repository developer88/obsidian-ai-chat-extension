import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { AiChatPluginSettings, DictationMode } from '../types';
import { AgyCliService } from './AgyCliService';

export type SttSpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export type SttConfig = Pick<
	AiChatPluginSettings,
	'dictationMode' | 'sttCliCommand' | 'sttCliArgs' | 'sttUseWsl'
>;

export interface OsDictationHint {
	shortcut: string;
	message: string;
}

export interface TextareaCursorState {
	value: string;
	selectionStart: number | null;
	selectionEnd: number | null;
}

/**
 * Converts a Windows path (e.g. C:\Users\foo\bar.webm) to a WSL mount path (/mnt/c/Users/foo/bar.webm).
 */
export function toWslAudioPath(winPath: string): string {
	const match = winPath.match(/^([a-zA-Z]):[\\/](.*)$/);
	if (match) {
		const drive = match[1].toLowerCase();
		const rest = match[2].replace(/\\/g, '/');
		return `/mnt/${drive}/${rest}`;
	}
	return winPath.replace(/\\/g, '/');
}

/**
 * Builds the CLI argument list for a local STT binary, substituting {file} with the audio path.
 */
export function buildSttArgs(template: string | undefined, audioFilePath: string): string[] {
	const rawTemplate = template?.trim() || '';
	const args: string[] = [];

	if (rawTemplate.includes('{file}')) {
		const parts = rawTemplate.split(/\s+/);
		for (const part of parts) {
			if (part === '{file}') {
				args.push(audioFilePath);
			} else if (part.includes('{file}')) {
				args.push(part.replace('{file}', audioFilePath));
			} else {
				args.push(part);
			}
		}
	} else {
		if (rawTemplate.length > 0) {
			args.push(...rawTemplate.split(/\s+/));
		}
		args.push(audioFilePath);
	}

	return args;
}

/**
 * Returns whether the microphone dictation button is enabled in settings.
 */
export function isDictationEnabled(settings: Pick<AiChatPluginSettings, 'enableDictation'>): boolean {
	return Boolean(settings.enableDictation);
}

/**
 * Resolves the effective dictation mode from plugin settings.
 */
export function resolveDictationMode(settings: Pick<AiChatPluginSettings, 'dictationMode'>): DictationMode {
	return settings.dictationMode === 'local-cli' ? 'local-cli' : 'os';
}

/**
 * Returns the OS-specific keyboard shortcut hint for native dictation.
 */
export function getOsDictationHint(platform: NodeJS.Platform = process.platform): OsDictationHint {
	if (platform === 'darwin') {
		return {
			shortcut: 'Fn × 2',
			message: 'Press Fn twice (or Edit → Start Dictation) to dictate into the focused input.'
		};
	}
	if (platform === 'win32') {
		return {
			shortcut: 'Win + H',
			message: 'Press Win + H to start Windows Voice Typing in the focused input.'
		};
	}
	return {
		shortcut: 'OS Dictation',
		message: 'Use your system dictation shortcut to type into the focused input.'
	};
}

/**
 * Resolves the executable command and argument vector for invoking a local STT CLI.
 */
export function resolveSttExecution(
	config: Pick<AiChatPluginSettings, 'sttCliCommand' | 'sttCliArgs' | 'sttUseWsl'>,
	audioFilePath: string
): { command: string; args: string[] } {
	const rawCmd = (config.sttCliCommand || '').trim();
	if (!rawCmd) {
		throw new Error('Local STT CLI command is not configured. Set it in Sidecar AI settings.');
	}
	if (/[;&|`$<>]/.test(rawCmd)) {
		throw new Error(`Invalid characters in Local STT CLI command: "${rawCmd}".`);
	}

	const sanitizedArgsTemplate = (config.sttCliArgs || '{file}').trim();
	if (/[;&|`$<>]/.test(sanitizedArgsTemplate)) {
		throw new Error('Invalid shell metacharacters in Local STT CLI arguments.');
	}

	const targetAudioPath = config.sttUseWsl ? toWslAudioPath(audioFilePath) : audioFilePath;
	const sttArgs = buildSttArgs(sanitizedArgsTemplate, targetAudioPath);

	if (config.sttUseWsl) {
		return {
			command: 'wsl',
			args: ['-d', 'Ubuntu', '--', rawCmd, ...sttArgs]
		};
	}

	return {
		command: rawCmd,
		args: sttArgs
	};
}

/**
 * Inserts transcribed text at the current cursor/selection range in a textarea-like state.
 */
export function insertTextAtCursor(
	textarea: TextareaCursorState,
	transcript: string
): { nextValue: string; nextCursorPos: number } {
	const value = textarea.value || '';
	const start = textarea.selectionStart !== null ? Math.max(0, Math.min(textarea.selectionStart, value.length)) : value.length;
	const end = textarea.selectionEnd !== null ? Math.max(start, Math.min(textarea.selectionEnd, value.length)) : start;

	const before = value.slice(0, start);
	const after = value.slice(end);
	const nextValue = `${before}${transcript}${after}`;
	const nextCursorPos = start + transcript.length;

	return { nextValue, nextCursorPos };
}

/**
 * Handles audio file transcription via a user-configured local STT CLI or OS dictation hints.
 */
export class DictationService {
	private activeProcess: ChildProcess | null = null;
	private spawner: SttSpawnFn;

	constructor(spawner?: SttSpawnFn) {
		this.spawner = spawner || spawn;
	}

	/**
	 * Aborts any in-flight local STT CLI process.
	 */
	public abort(): void {
		if (this.activeProcess) {
			try {
				this.activeProcess.kill('SIGTERM');
			} catch {
				// Process may have already exited
			}
			this.activeProcess = null;
		}
	}

	/**
	 * Attempts to trigger the operating system's native dictation shortcut into the currently focused input.
	 * Falls back with `{ triggered: false, message }` if the platform is unsupported or OS invocation fails.
	 */
	public triggerOsDictation(platform: NodeJS.Platform = process.platform): Promise<{ triggered: boolean; message: string }> {
		const hint = getOsDictationHint(platform);

		let command = '';
		let args: string[] = [];

		if (platform === 'win32') {
			const psScript = [
				'Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; public class WinH { [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo); public static void Trigger() { keybd_event(0x5B, 0, 0, UIntPtr.Zero); keybd_event(0x48, 0, 0, UIntPtr.Zero); keybd_event(0x48, 0, 2, UIntPtr.Zero); keybd_event(0x5B, 0, 2, UIntPtr.Zero); } }\'',
				'[WinH]::Trigger()'
			].join('\n');
			const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
			command = 'powershell.exe';
			args = ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded];
		} else if (platform === 'darwin') {
			command = 'osascript';
			args = [
				'-e', 'tell application "System Events"',
				'-e', 'set frontApp to first application process whose frontmost is true',
				'-e', 'tell frontApp',
				'-e', 'try',
				'-e', 'click menu item "Start Dictation…" of menu "Edit" of menu bar 1',
				'-e', 'on error',
				'-e', 'try',
				'-e', 'click menu item "Start Dictation" of menu "Edit" of menu bar 1',
				'-e', 'on error',
				'-e', 'key code 63',
				'-e', 'delay 0.1',
				'-e', 'key code 63',
				'-e', 'end try',
				'-e', 'end try',
				'-e', 'end tell',
				'-e', 'end tell'
			];
		} else {
			return Promise.resolve({ triggered: false, message: hint.message });
		}

		return new Promise((resolve) => {
			let settled = false;
			const finish = (triggered: boolean) => {
				if (settled) return;
				settled = true;
				resolve(triggered ? { triggered: true, message: '' } : { triggered: false, message: hint.message });
			};

			try {
				const child = this.spawner(command, args, {
					windowsHide: true,
					shell: false,
					stdio: 'ignore'
				});
				child.on('error', () => finish(false));
				child.on('close', (code: number | null) => finish(code === 0));
			} catch {
				finish(false);
			}
		});
	}

	/**
	 * Runs the configured local STT CLI against an audio file path and returns trimmed stdout.
	 */
	public transcribeAudioFile(
		audioFilePath: string,
		config: Pick<AiChatPluginSettings, 'sttCliCommand' | 'sttCliArgs' | 'sttUseWsl'>
	): Promise<string> {
		this.abort();
		const { command, args } = resolveSttExecution(config, audioFilePath);

		return new Promise((resolve, reject) => {
			let stdout = '';
			let stderr = '';
			let settled = false;

			const finish = (err: Error | null, result?: string) => {
				if (settled) return;
				settled = true;
				this.activeProcess = null;
				if (err) {
					reject(err);
				} else {
					resolve(result ?? '');
				}
			};

			try {
				const child = this.spawner(command, args, {
					env: AgyCliService.getSpawnEnvironment(),
					shell: false,
					stdio: ['ignore', 'pipe', 'pipe']
				});

				this.activeProcess = child;

				child.stdout?.on('data', (chunk: Buffer) => {
					stdout += chunk.toString();
				});

				child.stderr?.on('data', (chunk: Buffer) => {
					stderr += chunk.toString();
				});

				child.on('error', (err: NodeJS.ErrnoException) => {
					if (err.code === 'ENOENT') {
						finish(new Error(`Local STT CLI "${command}" was not found. Check the command path in settings.`));
					} else {
						finish(new Error(`Failed to start Local STT CLI "${command}": ${err.message}`));
					}
				});

				child.on('close', (code: number | null) => {
					if (code !== 0) {
						const detail = stderr.trim() || `exit code ${code ?? 'unknown'}`;
						finish(new Error(`Local STT CLI failed (${detail}).`));
						return;
					}
					finish(null, stdout.trim());
				});
			} catch (err) {
				finish(err instanceof Error ? err : new Error(String(err)));
			}
		});
	}

	/**
	 * Writes an in-memory audio buffer to a temporary file, transcribes it, and always cleans up.
	 */
	public async transcribeBuffer(
		buffer: ArrayBuffer | Uint8Array,
		extension: string,
		config: Pick<AiChatPluginSettings, 'sttCliCommand' | 'sttCliArgs' | 'sttUseWsl'>
	): Promise<string> {
		const safeExt = extension.replace(/[^a-zA-Z0-9]/g, '') || 'webm';
		const tempFilePath = path.join(
			tmpdir(),
			`sidecar-stt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
		);
		const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

		await fs.writeFile(tempFilePath, bytes);
		try {
			return await this.transcribeAudioFile(tempFilePath, config);
		} finally {
			try {
				await fs.unlink(tempFilePath);
			} catch {
				// Best-effort cleanup of temp audio file
			}
		}
	}
}
