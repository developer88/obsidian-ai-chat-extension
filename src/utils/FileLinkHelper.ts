import type { App, TFile } from 'obsidian';
import * as path from 'path';

export interface ParsedFileUrl {
	rawUrl: string;
	filePath: string;
	line?: number;
	endLine?: number;
	fragment?: string;
	isRelative: boolean;
}

export interface ParseFileUrlOptions {
	isWindows?: boolean;
}

export interface OpenFileOptions {
	activeFilePath?: string;
	contextPath?: string;
	openInNewLeaf?: boolean;
	notify?: (message: string) => void;
}

/**
 * Checks whether a given string is a file: or file:// URL.
 */
export function isFileUrl(url: string): boolean {
	if (!url || typeof url !== 'string') return false;
	let trimmed = url.trim();
	if (
		(trimmed.startsWith('<') && trimmed.endsWith('>')) ||
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		trimmed = trimmed.slice(1, -1).trim();
	}
	return /^file:\/\//i.test(trimmed) || /^file:\//i.test(trimmed) || /^file:/i.test(trimmed);
}

/**
 * Parses and normalizes a file:// URL into a system file path and optional line/fragment anchors.
 */
export function parseFileUrl(rawUrl: string, options?: ParseFileUrlOptions): ParsedFileUrl | null {
	if (!isFileUrl(rawUrl)) {
		return null;
	}

	let clean = rawUrl.trim();

	// Strip surrounding angle brackets <file://...> or quotes
	if (
		(clean.startsWith('<') && clean.endsWith('>')) ||
		(clean.startsWith('"') && clean.endsWith('"')) ||
		(clean.startsWith("'") && clean.endsWith("'"))
	) {
		clean = clean.slice(1, -1).trim();
	}

	// Extract fragment / hash (e.g. #L10-L20, #line=10, #Heading)
	let fragment: string | undefined;
	const hashIdx = clean.indexOf('#');
	if (hashIdx !== -1) {
		fragment = clean.substring(hashIdx + 1);
		clean = clean.substring(0, hashIdx);
	}

	// Extract query parameters (if any)
	const queryIdx = clean.indexOf('?');
	if (queryIdx !== -1) {
		clean = clean.substring(0, queryIdx);
	}

	// Parse line and endLine from fragment
	let line: number | undefined;
	let endLine: number | undefined;
	if (fragment) {
		// Match GitHub/IDE styles: #L12, #L12-L24, #L12-24, #12, #12-24, #l12
		const lineRangeMatch = fragment.match(/^(?:L|l)?(\d+)(?:(?:-L?|-)(\d+))?$/);
		if (lineRangeMatch) {
			line = parseInt(lineRangeMatch[1], 10);
			if (lineRangeMatch[2]) {
				endLine = parseInt(lineRangeMatch[2], 10);
			}
		} else {
			const lineParamMatch = fragment.match(/^line=(\d+)(?:-(\d+))?/i);
			if (lineParamMatch) {
				line = parseInt(lineParamMatch[1], 10);
				if (lineParamMatch[2]) {
					endLine = parseInt(lineParamMatch[2], 10);
				}
			}
		}
	}

	// URL decode
	try {
		clean = decodeURIComponent(clean);
	} catch {
		clean = clean.replace(/%20/g, ' ');
	}

	const isWindows = options?.isWindows ?? (typeof process !== 'undefined' && process.platform === 'win32');

	// Handle WSL UNC paths: file://wsl$/... or file:////wsl$/... or file://wsl.localhost/...
	const wslUncMatch = clean.match(/^file:(?:\/{2,4})(wsl(?:\$|\.localhost)[/\\].*)$/i);
	if (wslUncMatch) {
		const uncPath = '\\\\' + wslUncMatch[1].replace(/\//g, '\\');
		return {
			rawUrl,
			filePath: uncPath,
			line,
			endLine,
			fragment,
			isRelative: false
		};
	}

	// Strip file: prefix while preserving path slashes
	let pathPart = clean;
	if (/^file:\/\//i.test(pathPart)) {
		pathPart = pathPart.slice('file://'.length);
	} else if (/^file:\//i.test(pathPart)) {
		pathPart = pathPart.slice('file:/'.length);
	} else if (/^file:/i.test(pathPart)) {
		pathPart = pathPart.slice('file:'.length);
	}

	// Strip localhost if present (e.g. file://localhost/C:/... or file://localhost/home/...)
	if (pathPart.toLowerCase().startsWith('localhost/')) {
		pathPart = pathPart.slice('localhost'.length); // leaves leading /
	} else if (pathPart.toLowerCase().startsWith('localhost\\')) {
		pathPart = pathPart.slice('localhost'.length);
	}

	// Strip leading slash before Windows drive letter (e.g. /C:/path -> C:/path)
	if (/^\/[a-zA-Z]:/i.test(pathPart) || /^\\+[a-zA-Z]:/i.test(pathPart)) {
		pathPart = pathPart.replace(/^[/\\+]+/, '');
	}

	// Handle WSL /mnt/<drive>/... on Windows
	const mntMatch = pathPart.match(/^\/?mnt\/([a-zA-Z])\/(.*)$/i);
	if (mntMatch && isWindows) {
		pathPart = `${mntMatch[1].toUpperCase()}:/${mntMatch[2]}`;
	}

	// Determine if path is relative
	const isRelative =
		!pathPart.startsWith('/') &&
		!pathPart.startsWith('\\') &&
		!/^[a-zA-Z]:/i.test(pathPart);

	return {
		rawUrl,
		filePath: pathPart,
		line,
		endLine,
		fragment,
		isRelative
	};
}

/**
 * Finds bare file:// URLs in markdown text (outside of code blocks and existing links)
 * and wraps them in markdown links so that MarkdownRenderer converts them to <a> tags.
 */
export function linkifyFileUrls(markdown: string): string {
	if (!markdown || !markdown.includes('file://')) {
		return markdown;
	}

	// Regex matches:
	// Group 1: fenced code blocks, inline code, existing markdown links, or existing HTML tags
	// Group 2: bare file:// URLs
	const pattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|!?\[[^\]]*\]\([^)]*\)|<[^>]+>)|(file:\/\/[^\s<>"'`]+)/g;

	return markdown.replace(pattern, (match: string, preserved: string | undefined, bareUrl: string | undefined): string => {
		if (preserved) {
			return preserved;
		}
		if (bareUrl) {
			let trailing = '';
			let url = bareUrl;
			while (url.length > 0 && /[.,;:!?)\]]$/.test(url)) {
				if (url.endsWith(')')) {
					const openCount = (url.match(/\(/g) || []).length;
					const closeCount = (url.match(/\)/g) || []).length;
					if (closeCount <= openCount) {
						break;
					}
				}
				trailing = url.slice(-1) + trailing;
				url = url.slice(0, -1);
			}
			return `[${url}](${url})${trailing}`;
		}
		return match;
	});
}

/**
 * Resolves a ParsedFileUrl to a TFile inside the Obsidian vault if one exists.
 */
export function resolveFileInVault(app: App, parsed: ParsedFileUrl): TFile | null {
	const adapter = app.vault.adapter;
	let vaultBasePath = '';
	if (adapter && typeof (adapter as unknown as { getBasePath?: () => string }).getBasePath === 'function') {
		vaultBasePath = (adapter as unknown as { getBasePath: () => string }).getBasePath();
	}

	const normFile = parsed.filePath.replace(/\\/g, '/');

	// Helper to verify if an abstract file is a TFile (not a folder)
	const isTFile = (f: unknown): f is TFile => {
		return !!f && typeof f === 'object' && 'path' in f && !('children' in f);
	};

	// 1. Check if inside vaultBasePath
	if (vaultBasePath) {
		const normVault = vaultBasePath.replace(/\\/g, '/').replace(/\/+$/, '');
		const isWin = typeof process !== 'undefined' && process.platform === 'win32';
		const matchesVault = isWin
			? normFile.toLowerCase().startsWith(normVault.toLowerCase() + '/')
			: normFile.startsWith(normVault + '/');

		if (matchesVault) {
			const relPath = normFile.slice(normVault.length + 1);
			const file = app.vault.getAbstractFileByPath(relPath);
			if (isTFile(file)) {
				return file;
			}
		}
	}

	// 2. Direct vault path or relative path
	const cleanRel = normFile.replace(/^[/\\+]+/, '');
	const directFile = app.vault.getAbstractFileByPath(cleanRel);
	if (isTFile(directFile)) {
		return directFile;
	}

	// 3. Metadata cache fuzzy lookup
	const cachedFile = app.metadataCache.getFirstLinkpathDest(cleanRel, '');
	if (isTFile(cachedFile)) {
		return cachedFile;
	}

	return null;
}

/**
 * Safely accesses Electron shell in Obsidian desktop environment.
 */
interface ElectronShell {
	openPath?: (targetPath: string) => Promise<string>;
	showItemInFolder?: (fullPath: string) => void;
	openExternal?: (url: string) => Promise<void>;
}

function getElectronShell(): ElectronShell | null {
	try {
		const win = typeof window !== 'undefined' ? (window as unknown as {
			require?: (mod: string) => { shell?: ElectronShell };
			electron?: { shell?: ElectronShell };
		}) : undefined;

		if (win?.electron?.shell) {
			return win.electron.shell;
		}

		if (win?.require) {
			const electron = win.require('electron');
			if (electron?.shell) {
				return electron.shell;
			}
		}
	} catch {
		// Ignore
	}

	return null;
}

/**
 * Opens an external file path using the desktop system's default application.
 */
export async function openSystemPath(
	app: App,
	targetPath: string,
	options?: { line?: number; notify?: (message: string) => void }
): Promise<boolean> {
	let opened = false;

	// 1. Electron shell.openPath
	const electronShell = getElectronShell();
	if (electronShell && typeof electronShell.openPath === 'function') {
		try {
			const error = await electronShell.openPath(targetPath);
			if (!error) {
				opened = true;
			} else {
				options?.notify?.(`Could not open file: ${targetPath}`);
				return false;
			}
		} catch {
			// Electron openPath error
		}
	}

	// 2. app.openWithDefaultApp
	if (!opened && typeof (app as unknown as { openWithDefaultApp?: (p: string) => Promise<void> }).openWithDefaultApp === 'function') {
		try {
			await (app as unknown as { openWithDefaultApp: (p: string) => Promise<void> }).openWithDefaultApp(targetPath);
			opened = true;
		} catch {
			// app.openWithDefaultApp failed
		}
	}

	if (opened) {
		const baseName = targetPath.split(/[/\\/]/).pop() || targetPath;
		const lineMsg = options?.line ? ` (line ${options.line})` : '';
		options?.notify?.(`Opened ${baseName}${lineMsg}`);
		return true;
	} else {
		options?.notify?.(`Could not open file: ${targetPath}`);
		return false;
	}
}

/**
 * Reveals a file in the system file manager (Explorer, Finder, etc.).
 */
export async function revealFileInFolder(targetPath: string): Promise<boolean> {
	const electronShell = getElectronShell();
	if (electronShell && typeof electronShell.showItemInFolder === 'function') {
		try {
			electronShell.showItemInFolder(targetPath);
			return true;
		} catch {
			// showItemInFolder failed
		}
	}

	return false;
}

/**
 * Handles opening a file:// URL either in an Obsidian leaf (if in vault)
 * or via the system default application (if external).
 */
export async function openFileUrl(
	app: App,
	rawUrl: string,
	options?: OpenFileOptions
): Promise<boolean> {
	const parsed = parseFileUrl(rawUrl);
	if (!parsed || !parsed.filePath) {
		options?.notify?.(`Invalid file link: ${rawUrl}`);
		return false;
	}

	// 1. Check if inside vault
	const vaultFile = resolveFileInVault(app, parsed);
	if (vaultFile) {
		try {
			const leaf = app.workspace.getLeaf(options?.openInNewLeaf ? 'tab' : false);
			await leaf.openFile(vaultFile);

			const view = leaf.view as unknown as {
				getViewType?: () => string;
				editor?: {
					setCursor: (pos: { line: number; ch: number }) => void;
					scrollIntoView: (range: { from: { line: number; ch: number }; to: { line: number; ch: number } }, center?: boolean) => void;
				};
			};

			if (parsed.line !== undefined && view && view.getViewType?.() === 'markdown' && view.editor) {
				const editor = view.editor;
				const startLineIdx = Math.max(0, parsed.line - 1);
				const endLineIdx = parsed.endLine !== undefined ? Math.max(0, parsed.endLine - 1) : startLineIdx;
				editor.setCursor({ line: startLineIdx, ch: 0 });
				editor.scrollIntoView(
					{
						from: { line: startLineIdx, ch: 0 },
						to: { line: endLineIdx, ch: 0 }
					},
					true
				);
			} else if (parsed.fragment && !parsed.line) {
				await app.workspace.openLinkText(
					vaultFile.path + '#' + parsed.fragment,
					'',
					options?.openInNewLeaf ? 'tab' : false
				);
			}

			app.workspace.setActiveLeaf(leaf, { focus: true });
			return true;
		} catch {
			// Fallback to opening externally if vault leaf failed
		}
	}

	// 2. Outside vault
	let targetPath = parsed.filePath;

	if (parsed.isRelative) {
		if (options?.activeFilePath) {
			targetPath = path.resolve(path.dirname(options.activeFilePath), targetPath);
		} else if (options?.contextPath) {
			targetPath = path.resolve(options.contextPath, targetPath);
		} else {
			const adapter = app.vault.adapter;
			const vaultBasePath = (adapter && typeof (adapter as unknown as { getBasePath?: () => string }).getBasePath === 'function')
				? (adapter as unknown as { getBasePath: () => string }).getBasePath()
				: '';
			if (vaultBasePath) {
				targetPath = path.resolve(vaultBasePath, targetPath);
			} else if (typeof process !== 'undefined' && process.cwd) {
				targetPath = path.resolve(process.cwd(), targetPath);
			}
		}
	}

	if (typeof process !== 'undefined' && process.platform === 'win32' && !targetPath.startsWith('\\\\')) {
		targetPath = targetPath.replace(/\//g, '\\');
	}

	return await openSystemPath(app, targetPath, { line: parsed.line, notify: options?.notify });
}

/**
 * Adds CSS class and title tooltip to all file:// links in a container element.
 */
export function decorateFileLinks(container: HTMLElement): void {
	const links = container.querySelectorAll<HTMLAnchorElement>('a[href^="file:"], a[href^="file://"]');
	links.forEach((a) => {
		a.addClass('agy-file-link');
		const href = a.getAttribute('href');
		if (href) {
			const parsed = parseFileUrl(href);
			if (parsed) {
				const lineSuffix = parsed.line ? ` (line ${parsed.line})` : '';
				a.setAttribute('title', `Open: ${parsed.filePath}${lineSuffix}`);
			}
		}
	});
}
