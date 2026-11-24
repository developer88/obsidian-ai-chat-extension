import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { ChildProcess, SpawnOptions } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import {
	buildSttArgs,
	DictationService,
	getOsDictationHint,
	insertTextAtCursor,
	resolveDictationMode,
	resolveSttExecution,
	toWslAudioPath
} from '../src/services/DictationService';
import { DEFAULT_SETTINGS } from '../src/types';

function createMockChildProcess(): ChildProcess & {
	stdoutEmitter: EventEmitter;
	stderrEmitter: EventEmitter;
	killedWith: string | null;
} {
	const proc = new EventEmitter() as ChildProcess & {
		stdoutEmitter: EventEmitter;
		stderrEmitter: EventEmitter;
		killedWith: string | null;
	};
	proc.stdoutEmitter = new EventEmitter();
	proc.stderrEmitter = new EventEmitter();
	proc.killedWith = null;
	(proc as unknown as { stdout: EventEmitter }).stdout = proc.stdoutEmitter;
	(proc as unknown as { stderr: EventEmitter }).stderr = proc.stderrEmitter;
	proc.kill = ((signal?: NodeJS.Signals | number) => {
		proc.killedWith = String(signal ?? 'SIGTERM');
		return true;
	}) as ChildProcess['kill'];
	return proc;
}

describe('DictationService - Unit & Helper Tests', () => {
	test('resolveDictationMode defaults to os and respects local-cli', () => {
		assert.equal(resolveDictationMode(DEFAULT_SETTINGS), 'os');
		assert.equal(resolveDictationMode({ dictationMode: 'os' }), 'os');
		assert.equal(resolveDictationMode({ dictationMode: 'local-cli' }), 'local-cli');
	});

	test('getOsDictationHint returns platform-specific shortcuts', () => {
		const winHint = getOsDictationHint('win32');
		assert.equal(winHint.shortcut, 'Win + H');
		assert.ok(winHint.message.includes('Win + H'));

		const macHint = getOsDictationHint('darwin');
		assert.equal(macHint.shortcut, 'Fn × 2');
		assert.ok(macHint.message.includes('Fn'));

		const linuxHint = getOsDictationHint('linux');
		assert.equal(linuxHint.shortcut, 'OS Dictation');
		assert.ok(linuxHint.message.length > 0);
	});

	test('toWslAudioPath translates Windows paths to /mnt/<drive>/...', () => {
		assert.equal(
			toWslAudioPath('C:\\Users\\andrey\\AppData\\Local\\Temp\\audio.webm'),
			'/mnt/c/Users/andrey/AppData/Local/Temp/audio.webm'
		);
		assert.equal(toWslAudioPath('/tmp/audio.webm'), '/tmp/audio.webm');
	});

	test('buildSttArgs substitutes {file} or appends file path when omitted', () => {
		assert.deepEqual(
			buildSttArgs('-f {file} --no-timestamps', '/tmp/test.webm'),
			['-f', '/tmp/test.webm', '--no-timestamps']
		);
		assert.deepEqual(
			buildSttArgs('--input={file}', '/tmp/test.webm'),
			['--input=/tmp/test.webm']
		);
		assert.deepEqual(
			buildSttArgs('--model base', '/tmp/test.webm'),
			['--model', 'base', '/tmp/test.webm']
		);
		assert.deepEqual(
			buildSttArgs('', '/tmp/test.webm'),
			['/tmp/test.webm']
		);
	});

	test('resolveSttExecution builds native and WSL commands and validates inputs', () => {
		const nativeExec = resolveSttExecution(
			{ sttCliCommand: 'whisper-cli', sttCliArgs: '-f {file} -nt', sttUseWsl: false },
			'/tmp/clip.webm'
		);
		assert.equal(nativeExec.command, 'whisper-cli');
		assert.deepEqual(nativeExec.args, ['-f', '/tmp/clip.webm', '-nt']);

		const wslExec = resolveSttExecution(
			{ sttCliCommand: 'whisper-cli', sttCliArgs: '-f {file}', sttUseWsl: true },
			'C:\\Temp\\clip.webm'
		);
		assert.equal(wslExec.command, 'wsl');
		assert.deepEqual(wslExec.args, ['-d', 'Ubuntu', '--', 'whisper-cli', '-f', '/mnt/c/Temp/clip.webm']);

		assert.throws(
			() => resolveSttExecution({ sttCliCommand: '   ', sttCliArgs: '{file}', sttUseWsl: false }, '/tmp/a.webm'),
			/not configured/
		);
		assert.throws(
			() => resolveSttExecution({ sttCliCommand: 'whisper; rm -rf /', sttCliArgs: '{file}', sttUseWsl: false }, '/tmp/a.webm'),
			/Invalid characters/
		);
		assert.throws(
			() => resolveSttExecution({ sttCliCommand: 'whisper', sttCliArgs: '{file} && whoami', sttUseWsl: false }, '/tmp/a.webm'),
			/Invalid shell metacharacters/
		);
	});

	test('insertTextAtCursor inserts at start, middle, end, selection, and null cursor', () => {
		assert.deepEqual(
			insertTextAtCursor({ value: '', selectionStart: 0, selectionEnd: 0 }, 'hello'),
			{ nextValue: 'hello', nextCursorPos: 5 }
		);
		assert.deepEqual(
			insertTextAtCursor({ value: 'world', selectionStart: 0, selectionEnd: 0 }, 'hello '),
			{ nextValue: 'hello world', nextCursorPos: 6 }
		);
		assert.deepEqual(
			insertTextAtCursor({ value: 'hello world', selectionStart: 6, selectionEnd: 6 }, 'beautiful '),
			{ nextValue: 'hello beautiful world', nextCursorPos: 16 }
		);
		assert.deepEqual(
			insertTextAtCursor({ value: 'hello world', selectionStart: 6, selectionEnd: 11 }, 'Obsidian'),
			{ nextValue: 'hello Obsidian', nextCursorPos: 14 }
		);
		assert.deepEqual(
			insertTextAtCursor({ value: 'hello ', selectionStart: null, selectionEnd: null }, 'there'),
			{ nextValue: 'hello there', nextCursorPos: 11 }
		);
	});
});

describe('DictationService - Process & Spawner Tests', () => {
	test('transcribeAudioFile resolves trimmed stdout on exit code 0', async () => {
		let capturedCmd = '';
		let capturedArgs: string[] = [];
		let capturedOpts: SpawnOptions | undefined;

		const service = new DictationService((cmd, args, opts) => {
			capturedCmd = cmd;
			capturedArgs = args;
			capturedOpts = opts;
			const child = createMockChildProcess();
			queueMicrotask(() => {
				child.stdoutEmitter.emit('data', Buffer.from('  Hello from Whisper  \n'));
				child.emit('close', 0);
			});
			return child;
		});

		const result = await service.transcribeAudioFile('/tmp/sample.webm', {
			sttCliCommand: 'whisper-cli',
			sttCliArgs: '-f {file}',
			sttUseWsl: false
		});

		assert.equal(capturedCmd, 'whisper-cli');
		assert.deepEqual(capturedArgs, ['-f', '/tmp/sample.webm']);
		assert.equal(capturedOpts?.shell, false);
		assert.equal(result, 'Hello from Whisper');
	});

	test('transcribeAudioFile surfaces ENOENT with helpful error', async () => {
		const service = new DictationService(() => {
			const child = createMockChildProcess();
			queueMicrotask(() => {
				const err = Object.assign(new Error('spawn missing-bin ENOENT'), { code: 'ENOENT' });
				child.emit('error', err);
			});
			return child;
		});

		await assert.rejects(
			() =>
				service.transcribeAudioFile('/tmp/sample.webm', {
					sttCliCommand: 'missing-bin',
					sttCliArgs: '{file}',
					sttUseWsl: false
				}),
			/was not found/
		);
	});

	test('transcribeAudioFile rejects on non-zero exit code with stderr', async () => {
		const service = new DictationService(() => {
			const child = createMockChildProcess();
			queueMicrotask(() => {
				child.stderrEmitter.emit('data', Buffer.from('model file missing'));
				child.emit('close', 2);
			});
			return child;
		});

		await assert.rejects(
			() =>
				service.transcribeAudioFile('/tmp/sample.webm', {
					sttCliCommand: 'whisper-cli',
					sttCliArgs: '{file}',
					sttUseWsl: false
				}),
			/model file missing/
		);
	});

	test('abort kills active STT process', () => {
		const child = createMockChildProcess();
		const service = new DictationService(() => child);

		void service.transcribeAudioFile('/tmp/sample.webm', {
			sttCliCommand: 'whisper-cli',
			sttCliArgs: '{file}',
			sttUseWsl: false
		}).catch(() => {
			// Ignore if aborted
		});

		service.abort();
		assert.equal(child.killedWith, 'SIGTERM');
	});

	test('triggerOsDictation launches hidden PowerShell Win+H on win32 and returns triggered=true on exit 0', async () => {
		let capturedCmd = '';
		let capturedArgs: string[] = [];
		let capturedOpts: SpawnOptions | undefined;

		const service = new DictationService((cmd, args, opts) => {
			capturedCmd = cmd;
			capturedArgs = args;
			capturedOpts = opts;
			const child = createMockChildProcess();
			queueMicrotask(() => child.emit('close', 0));
			return child;
		});

		const result = await service.triggerOsDictation('win32');
		assert.equal(result.triggered, true);
		assert.equal(capturedCmd, 'powershell.exe');
		assert.ok(capturedArgs.includes('-EncodedCommand'));
		assert.equal(capturedOpts?.windowsHide, true);
		assert.equal(capturedOpts?.shell, false);
	});

	test('triggerOsDictation falls back to hint message on spawn error or unsupported OS', async () => {
		const failingService = new DictationService(() => {
			const child = createMockChildProcess();
			queueMicrotask(() => child.emit('error', new Error('spawn failed')));
			return child;
		});

		const winFail = await failingService.triggerOsDictation('win32');
		assert.equal(winFail.triggered, false);
		assert.ok(winFail.message.includes('Win + H'));

		const linuxFallback = await failingService.triggerOsDictation('linux');
		assert.equal(linuxFallback.triggered, false);
		assert.ok(linuxFallback.message.length > 0);
	});
});

describe('DictationService - Real Child Process E2E', () => {
	test('E2E: transcribeBuffer writes temp file, invokes real Node CLI, returns transcript, and cleans up', async () => {
		const beforeFiles = new Set(await fs.readdir(tmpdir()));
		const service = new DictationService();
		const payload = new TextEncoder().encode('fake-webm-audio-payload');

		const scriptPath = path.join(tmpdir(), `sidecar-stt-e2e-${Date.now()}.cjs`);
		await fs.writeFile(
			scriptPath,
			'const fs = require("fs"); const buf = fs.readFileSync(process.argv[2]); process.stdout.write("ok:" + buf.toString("utf8") + "\\n");',
			'utf8'
		);

		try {
			const e2eTranscript = await service.transcribeBuffer(payload, 'webm', {
				sttCliCommand: process.execPath,
				sttCliArgs: `${scriptPath} {file}`,
				sttUseWsl: false
			});

			assert.equal(e2eTranscript, 'ok:fake-webm-audio-payload');

			const afterFiles = await fs.readdir(tmpdir());
			const leftoverSidecarAudio = afterFiles.filter(
				(name) => name.startsWith('sidecar-stt-') && name.endsWith('.webm') && !beforeFiles.has(name)
			);
			assert.deepEqual(leftoverSidecarAudio, []);
		} finally {
			await fs.unlink(scriptPath).catch(() => {});
		}
	});

	test('E2E: transcribeBuffer cleans up temp file even when STT CLI fails', async () => {
		const beforeFiles = new Set(await fs.readdir(tmpdir()));
		const service = new DictationService();
		const payload = new TextEncoder().encode('failing-audio');

		await assert.rejects(
			() =>
				service.transcribeBuffer(payload, 'wav', {
					sttCliCommand: process.execPath,
					sttCliArgs: '-e process.exit(1) {file}',
					sttUseWsl: false
				}),
			/Local STT CLI failed/
		);

		const afterFiles = await fs.readdir(tmpdir());
		const leftoverSidecarAudio = afterFiles.filter(
			(name) => name.startsWith('sidecar-stt-') && name.endsWith('.wav') && !beforeFiles.has(name)
		);
		assert.deepEqual(leftoverSidecarAudio, []);
	});
});
