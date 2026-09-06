const fs = require('fs');

const tag = process.env.TAG || process.argv[2] || '';
try {
  const content = fs.readFileSync('CHANGELOG.md', 'utf8');
  const targetHeader = `## [${tag}]`;
  const startIndex = content.indexOf(targetHeader);
  if (startIndex !== -1) {
    let fromHeader = content.substring(startIndex + targetHeader.length);
    const lineEnd = fromHeader.indexOf('\n');
    if (lineEnd !== -1) {
      fromHeader = fromHeader.substring(lineEnd + 1);
    }
    const nextHeaderMatch = fromHeader.search(/\n##\s+\[/);
    const notes = nextHeaderMatch !== -1
      ? fromHeader.substring(0, nextHeaderMatch).trim()
      : fromHeader.trim();
    fs.writeFileSync('release_notes.md', notes + '\n');
    console.log(`Successfully generated release notes for ${tag}`);
  } else {
    fs.writeFileSync('release_notes.md', `Release ${tag}\n`);
    console.log(`Header not found for ${tag}, using default notes.`);
  }
} catch (e) {
  console.error('Error generating release notes:', e);
  fs.writeFileSync('release_notes.md', `Release ${tag}\n`);
}
