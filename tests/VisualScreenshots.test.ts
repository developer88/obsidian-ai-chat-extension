import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

describe('Visual & Screenshot Testing', () => {
	const screenshotsDir = path.resolve(__dirname, 'screenshots');

	const expectedScreenshots = [
		{ file: '01_chat_view_dark.png', desc: 'Chat View (Dark Theme)' },
		{ file: '02_chat_view_light.png', desc: 'Chat View (Light Theme)' },
		{ file: '03_settings_multi_provider.png', desc: 'Settings View with Collapsible Provider Cards' },
		{ file: '04_model_suggest_modal.png', desc: 'Model & Effort Switcher Suggestion Modal' }
	];

	test('all expected screenshot fixtures are generated and valid PNG files', () => {
		assert.ok(fs.existsSync(screenshotsDir), 'Screenshots directory must exist');

		for (const item of expectedScreenshots) {
			const filePath = path.join(screenshotsDir, item.file);
			assert.ok(fs.existsSync(filePath), `Screenshot for ${item.desc} (${item.file}) must exist`);

			const stat = fs.statSync(filePath);
			assert.ok(stat.size > 10000, `Screenshot ${item.file} must be a non-trivial image (>10KB), got ${stat.size} bytes`);

			// Validate PNG magic number signature: 0x89 0x50 0x4E 0x47
			const buffer = Buffer.alloc(8);
			const fd = fs.openSync(filePath, 'r');
			fs.readSync(fd, buffer, 0, 8, 0);
			fs.closeSync(fd);

			assert.equal(buffer[0], 0x89);
			assert.equal(buffer[1], 0x50); // P
			assert.equal(buffer[2], 0x4E); // N
			assert.equal(buffer[3], 0x47); // G
		}
	});

	test('visual test fixture HTML contains proper Obsidian theme tokens and styles link', () => {
		const fixturePath = path.resolve(__dirname, 'visual/fixture.html');
		assert.ok(fs.existsSync(fixturePath), 'fixture.html must exist');

		const content = fs.readFileSync(fixturePath, 'utf8');
		assert.ok(content.includes('--background-primary'), 'Fixture must declare Obsidian background-primary variable');
		assert.ok(content.includes('--interactive-accent'), 'Fixture must declare Obsidian interactive-accent variable');
		assert.ok(content.includes('theme-dark'), 'Fixture must support theme-dark class');
		assert.ok(content.includes('theme-light'), 'Fixture must support theme-light class');
		assert.ok(content.includes('styles.css'), 'Fixture must link to styles.css');
	});
});
