import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
	isFileUrl,
	parseFileUrl,
	linkifyFileUrls
} from '../src/utils/FileLinkHelper';

describe('FileLinkHelper - isFileUrl', () => {
	test('identifies valid file URLs with various slashes and case', () => {
		assert.equal(isFileUrl('file:///C:/Users/test/file.ts'), true);
		assert.equal(isFileUrl('file://C:/Users/test/file.ts'), true);
		assert.equal(isFileUrl('FILE:///home/user/file.ts'), true);
		assert.equal(isFileUrl('file:/path/to/file'), true);
		assert.equal(isFileUrl('  file:///C:/path  '), true);
		assert.equal(isFileUrl('<file:///C:/path>'), true);
	});

	test('rejects non-file URLs and invalid inputs', () => {
		assert.equal(isFileUrl('https://example.com'), false);
		assert.equal(isFileUrl('http://localhost:3000'), false);
		assert.equal(isFileUrl('app://obsidian.md/index.html'), false);
		assert.equal(isFileUrl('obsidian://open?vault=test'), false);
		assert.equal(isFileUrl(''), false);
		assert.equal(isFileUrl('C:/Users/test/file.ts'), false);
	});
});

describe('FileLinkHelper - parseFileUrl on Windows', () => {
	test('parses standard 3-slash Windows file URL', () => {
		const parsed = parseFileUrl('file:///C:/Users/andrey/code/app.ts', { isWindows: true });
		assert.ok(parsed);
		assert.equal(parsed.filePath, 'C:/Users/andrey/code/app.ts');
		assert.equal(parsed.isRelative, false);
		assert.equal(parsed.line, undefined);
		assert.equal(parsed.endLine, undefined);
	});

	test('parses 2-slash Windows file URL', () => {
		const parsed = parseFileUrl('file://C:/Users/andrey/code/app.ts', { isWindows: true });
		assert.ok(parsed);
		assert.equal(parsed.filePath, 'C:/Users/andrey/code/app.ts');
		assert.equal(parsed.isRelative, false);
	});

	test('parses localhost Windows file URL', () => {
		const parsed = parseFileUrl('file://localhost/C:/Users/andrey/code/app.ts', { isWindows: true });
		assert.ok(parsed);
		assert.equal(parsed.filePath, 'C:/Users/andrey/code/app.ts');
		assert.equal(parsed.isRelative, false);
	});

	test('parses Windows file URL with line numbers and line ranges', () => {
		const parsedSingle = parseFileUrl('file:///C:/Users/andrey/code/app.ts#L42', { isWindows: true });
		assert.ok(parsedSingle);
		assert.equal(parsedSingle.filePath, 'C:/Users/andrey/code/app.ts');
		assert.equal(parsedSingle.line, 42);
		assert.equal(parsedSingle.endLine, undefined);

		const parsedRange = parseFileUrl('file:///C:/Users/andrey/code/app.ts#L42-L55', { isWindows: true });
		assert.ok(parsedRange);
		assert.equal(parsedRange.filePath, 'C:/Users/andrey/code/app.ts');
		assert.equal(parsedRange.line, 42);
		assert.equal(parsedRange.endLine, 55);

		const parsedNumeric = parseFileUrl('file:///C:/Users/andrey/code/app.ts#100-120', { isWindows: true });
		assert.ok(parsedNumeric);
		assert.equal(parsedNumeric.line, 100);
		assert.equal(parsedNumeric.endLine, 120);

		const parsedParam = parseFileUrl('file:///C:/Users/andrey/code/app.ts#line=25', { isWindows: true });
		assert.ok(parsedParam);
		assert.equal(parsedParam.line, 25);
	});

	test('decodes URL components and spaces', () => {
		const parsed = parseFileUrl('file:///C:/My%20Folder/Notes%20%26%20Ideas/Note%201.md', { isWindows: true });
		assert.ok(parsed);
		assert.equal(parsed.filePath, 'C:/My Folder/Notes & Ideas/Note 1.md');
	});

	test('handles angle-bracketed file URLs', () => {
		const parsed = parseFileUrl('<file:///C:/Users/andrey/code/app.ts>', { isWindows: true });
		assert.ok(parsed);
		assert.equal(parsed.filePath, 'C:/Users/andrey/code/app.ts');
	});

	test('converts WSL /mnt/<drive> paths to Windows drive paths when on Windows', () => {
		const parsed = parseFileUrl('file:///mnt/c/Users/andrey/project/file.ts#L15', { isWindows: true });
		assert.ok(parsed);
		assert.equal(parsed.filePath, 'C:/Users/andrey/project/file.ts');
		assert.equal(parsed.line, 15);
	});

	test('converts WSL UNC paths to Windows UNC format', () => {
		const parsed = parseFileUrl('file://wsl$/Ubuntu/home/andrey/project/main.py', { isWindows: true });
		assert.ok(parsed);
		assert.equal(parsed.filePath, '\\\\wsl$\\Ubuntu\\home\\andrey\\project\\main.py');
		assert.equal(parsed.isRelative, false);

		const parsedLocalhost = parseFileUrl('file:////wsl.localhost/Ubuntu/home/andrey/app.js', { isWindows: true });
		assert.ok(parsedLocalhost);
		assert.equal(parsedLocalhost.filePath, '\\\\wsl.localhost\\Ubuntu\\home\\andrey\\app.js');
	});

	test('preserves non-line fragments such as headings or block references', () => {
		const parsedHeading = parseFileUrl('file:///C:/Vault/Note.md#Section%20One', { isWindows: true });
		assert.ok(parsedHeading);
		assert.equal(parsedHeading.filePath, 'C:/Vault/Note.md');
		assert.equal(parsedHeading.fragment, 'Section%20One');
		assert.equal(parsedHeading.line, undefined);

		const parsedBlock = parseFileUrl('file:///C:/Vault/Note.md#^block-id', { isWindows: true });
		assert.ok(parsedBlock);
		assert.equal(parsedBlock.filePath, 'C:/Vault/Note.md');
		assert.equal(parsedBlock.fragment, '^block-id');
	});

	test('recognizes relative paths', () => {
		const parsedRel1 = parseFileUrl('file://./src/index.ts', { isWindows: true });
		assert.ok(parsedRel1);
		assert.equal(parsedRel1.isRelative, true);

		const parsedRel2 = parseFileUrl('file://src/index.ts', { isWindows: true });
		assert.ok(parsedRel2);
		assert.equal(parsedRel2.isRelative, true);
	});
});

describe('FileLinkHelper - parseFileUrl on Unix/Linux/macOS', () => {
	test('parses Unix absolute file URLs preserving leading slash', () => {
		const parsed = parseFileUrl('file:///home/andrey/projects/src/main.ts#L30', { isWindows: false });
		assert.ok(parsed);
		assert.equal(parsed.filePath, '/home/andrey/projects/src/main.ts');
		assert.equal(parsed.line, 30);
		assert.equal(parsed.isRelative, false);
	});

	test('parses macOS absolute file URLs', () => {
		const parsed = parseFileUrl('file:///Users/andrey/Documents/Notes.md', { isWindows: false });
		assert.ok(parsed);
		assert.equal(parsed.filePath, '/Users/andrey/Documents/Notes.md');
		assert.equal(parsed.isRelative, false);
	});

	test('parses Unix file URLs with line ranges and line numbers', () => {
		const parsedRange = parseFileUrl('file:///home/andrey/projects/src/main.ts#L42-L55', { isWindows: false });
		assert.ok(parsedRange);
		assert.equal(parsedRange.filePath, '/home/andrey/projects/src/main.ts');
		assert.equal(parsedRange.line, 42);
		assert.equal(parsedRange.endLine, 55);

		const parsedNumeric = parseFileUrl('file:///home/andrey/projects/src/main.ts#100-120', { isWindows: false });
		assert.ok(parsedNumeric);
		assert.equal(parsedNumeric.line, 100);
		assert.equal(parsedNumeric.endLine, 120);

		const parsedParam = parseFileUrl('file:///home/andrey/projects/src/main.ts#line=25', { isWindows: false });
		assert.ok(parsedParam);
		assert.equal(parsedParam.line, 25);
	});

	test('decodes URL components and spaces on Unix paths', () => {
		const parsed = parseFileUrl('file:///home/andrey/My%20Folder/Notes%20%26%20Ideas/Note%201.md', { isWindows: false });
		assert.ok(parsed);
		assert.equal(parsed.filePath, '/home/andrey/My Folder/Notes & Ideas/Note 1.md');
		assert.equal(parsed.isRelative, false);
	});

	test('parses localhost Unix file URLs', () => {
		const parsed = parseFileUrl('file://localhost/home/andrey/project/main.py', { isWindows: false });
		assert.ok(parsed);
		assert.equal(parsed.filePath, '/home/andrey/project/main.py');
		assert.equal(parsed.isRelative, false);
	});

	test('handles angle-bracketed Unix file URLs', () => {
		const parsed = parseFileUrl('<file:///home/andrey/code/app.ts>', { isWindows: false });
		assert.ok(parsed);
		assert.equal(parsed.filePath, '/home/andrey/code/app.ts');
	});

	test('preserves Unix heading and block fragments', () => {
		const parsedHeading = parseFileUrl('file:///home/andrey/Vault/Note.md#Section%20One', { isWindows: false });
		assert.ok(parsedHeading);
		assert.equal(parsedHeading.filePath, '/home/andrey/Vault/Note.md');
		assert.equal(parsedHeading.fragment, 'Section%20One');
		assert.equal(parsedHeading.line, undefined);

		const parsedBlock = parseFileUrl('file:///home/andrey/Vault/Note.md#^block-id', { isWindows: false });
		assert.ok(parsedBlock);
		assert.equal(parsedBlock.filePath, '/home/andrey/Vault/Note.md');
		assert.equal(parsedBlock.fragment, '^block-id');
	});

	test('recognizes relative Unix paths', () => {
		const parsedRel1 = parseFileUrl('file://./src/index.ts', { isWindows: false });
		assert.ok(parsedRel1);
		assert.equal(parsedRel1.isRelative, true);

		const parsedRel2 = parseFileUrl('file://src/index.ts', { isWindows: false });
		assert.ok(parsedRel2);
		assert.equal(parsedRel2.isRelative, true);
	});

	test('preserves native /mnt/ paths when isWindows is false', () => {
		const parsed = parseFileUrl('file:///mnt/storage/shared/data.csv', { isWindows: false });
		assert.ok(parsed);
		assert.equal(parsed.filePath, '/mnt/storage/shared/data.csv');
		assert.equal(parsed.isRelative, false);
	});
});

describe('FileLinkHelper - linkifyFileUrls', () => {
	test('returns unmodified text if no file:// URL exists', () => {
		const input = 'Just regular markdown text with [normal link](https://example.com)';
		assert.equal(linkifyFileUrls(input), input);
	});

	test('converts bare file:// URLs into markdown links', () => {
		const input = 'Here is the file: file:///C:/Users/andrey/test.ts for your review.';
		const output = linkifyFileUrls(input);
		assert.equal(output, 'Here is the file: [file:///C:/Users/andrey/test.ts](file:///C:/Users/andrey/test.ts) for your review.');
	});

	test('does not convert file:// inside existing markdown links', () => {
		const input = 'See [my link](file:///C:/Users/andrey/test.ts) here.';
		assert.equal(linkifyFileUrls(input), input);
	});

	test('does not convert file:// inside inline code', () => {
		const input = 'Check the config `file:///fake/path/test.json` value.';
		assert.equal(linkifyFileUrls(input), input);
	});

	test('does not convert file:// inside fenced code blocks', () => {
		const input = '```typescript\nconst path = "file:///C:/ignore/this.ts";\n```\n';
		assert.equal(linkifyFileUrls(input), input);
	});

	test('correctly handles trailing punctuation at end of sentence or parenthesis', () => {
		const input = 'Check (file:///C:/Users/andrey/file.ts#L42).';
		const output = linkifyFileUrls(input);
		assert.equal(output, 'Check ([file:///C:/Users/andrey/file.ts#L42](file:///C:/Users/andrey/file.ts#L42)).');
	});
});

describe('FileLinkHelper - resolveFileInVault', () => {
	const mockVaultFiles: Record<string, { path: string }> = {
		'Daily/2026-10-15.md': { path: 'Daily/2026-10-15.md' },
		'Projects/Idea.md': { path: 'Projects/Idea.md' }
	};

	const mockApp = {
		vault: {
			adapter: {
				getBasePath: () => 'C:/Users/andrey/Vault'
			},
			getAbstractFileByPath: (p: string) => {
				const normalized = p.replace(/\\/g, '/');
				return mockVaultFiles[normalized] || null;
			}
		},
		metadataCache: {
			getFirstLinkpathDest: (cleanRel: string) => {
				return mockVaultFiles[cleanRel] || null;
			}
		}
	} as any;

	test('resolves file when absolute path is inside vault basePath', () => {
		const { resolveFileInVault } = require('../src/utils/FileLinkHelper');
		const parsed = parseFileUrl('file:///C:/Users/andrey/Vault/Daily/2026-10-15.md#L10', { isWindows: true });
		assert.ok(parsed);
		const file = resolveFileInVault(mockApp, parsed);
		assert.ok(file);
		assert.equal(file.path, 'Daily/2026-10-15.md');
	});

	test('resolves file when path is vault-relative', () => {
		const { resolveFileInVault } = require('../src/utils/FileLinkHelper');
		const parsed = parseFileUrl('file://Projects/Idea.md', { isWindows: true });
		assert.ok(parsed);
		const file = resolveFileInVault(mockApp, parsed);
		assert.ok(file);
		assert.equal(file.path, 'Projects/Idea.md');
	});

	test('returns null when path is outside vault', () => {
		const { resolveFileInVault } = require('../src/utils/FileLinkHelper');
		const parsed = parseFileUrl('file:///C:/Users/andrey/OtherFolder/script.py', { isWindows: true });
		assert.ok(parsed);
		const file = resolveFileInVault(mockApp, parsed);
		assert.equal(file, null);
	});

	test('resolves file when absolute path is inside Unix vault basePath', () => {
		const { resolveFileInVault } = require('../src/utils/FileLinkHelper');
		const originalPlatform = process.platform;
		try {
			Object.defineProperty(process, 'platform', { value: 'linux' });
			const mockUnixApp = {
				vault: {
					adapter: {
						getBasePath: () => '/home/andrey/Vault'
					},
					getAbstractFileByPath: (p: string) => {
						const normalized = p.replace(/\\/g, '/');
						return mockVaultFiles[normalized] || null;
					}
				},
				metadataCache: {
					getFirstLinkpathDest: (cleanRel: string) => mockVaultFiles[cleanRel] || null
				}
			} as any;

			const parsed = parseFileUrl('file:///home/andrey/Vault/Daily/2026-10-15.md#L10', { isWindows: false });
			assert.ok(parsed);
			const file = resolveFileInVault(mockUnixApp, parsed);
			assert.ok(file);
			assert.equal(file.path, 'Daily/2026-10-15.md');
		} finally {
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		}
	});

	test('respects case-sensitivity on Unix vault basePath', () => {
		const { resolveFileInVault } = require('../src/utils/FileLinkHelper');
		const originalPlatform = process.platform;
		try {
			Object.defineProperty(process, 'platform', { value: 'linux' });
			const mockUnixApp = {
				vault: {
					adapter: {
						getBasePath: () => '/home/andrey/Vault'
					},
					getAbstractFileByPath: (p: string) => {
						const normalized = p.replace(/\\/g, '/');
						return mockVaultFiles[normalized] || null;
					}
				},
				metadataCache: {
					getFirstLinkpathDest: (cleanRel: string) => mockVaultFiles[cleanRel] || null
				}
			} as any;

			// Lowercase 'vault' should not match uppercase 'Vault' on Unix
			const parsed = parseFileUrl('file:///home/andrey/vault/Daily/2026-10-15.md#L10', { isWindows: false });
			assert.ok(parsed);
			const file = resolveFileInVault(mockUnixApp, parsed);
			assert.equal(file, null);
		} finally {
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		}
	});

	test('returns null when path is outside Unix vault', () => {
		const { resolveFileInVault } = require('../src/utils/FileLinkHelper');
		const originalPlatform = process.platform;
		try {
			Object.defineProperty(process, 'platform', { value: 'linux' });
			const mockUnixApp = {
				vault: {
					adapter: {
						getBasePath: () => '/home/andrey/Vault'
					},
					getAbstractFileByPath: () => null
				},
				metadataCache: {
					getFirstLinkpathDest: () => null
				}
			} as any;

			const parsed = parseFileUrl('file:///etc/hosts', { isWindows: false });
			assert.ok(parsed);
			const file = resolveFileInVault(mockUnixApp, parsed);
			assert.equal(file, null);
		} finally {
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		}
	});
});
