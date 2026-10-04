const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

const project = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(project, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(project, 'app.js'), 'utf8');
const ids = [...app.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
for (const id of ids) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
}
assert.equal(new Set(ids).size, ids.length);
for (const script of ['audio.js', 'game.js', 'campaign.js', 'app.js']) {
  assert.match(html, new RegExp(`<script src=["']${script}["'] defer`), `missing script ${script}`);
}
assert.ok(html.indexOf('audio.js') < html.indexOf('app.js'));
assert.ok(html.indexOf('game.js') < html.indexOf('app.js'));
assert.ok(html.indexOf('campaign.js') < html.indexOf('app.js'));
console.log(`Passed: ${ids.length} UI bindings and dependency order.`);
