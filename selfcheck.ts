// Checks the VS Code side without VS Code: how commands and tool output turn into files and lines, and the level math.
// Runs on the compiled extension (npm test builds first). Node 22.18+ runs this .ts file directly.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findHits, bashCwd, readTarget, grepSoleFile } = require('./extension/out/parse.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bottv-'));
fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
const api = path.join(root, 'src', 'lib', 'api.ts');
fs.writeFileSync(api, Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n'));
// On Windows, also exercise Git Bash style paths (/c/Users/...)
const shellPath = (p: string) => (process.platform === 'win32' ? p.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).replace(/\\/g, '/') : p);

const cmd = `cd "${shellPath(root)}/src" && grep -rn "useX" lib | head -5`;
const cwd = bashCwd(os.tmpdir(), cmd);
assert.strictEqual(path.resolve(cwd), path.join(root, 'src'), 'follows the cd inside the command');

let hits = findHits('lib/api.ts:7:import x\nlib/api.ts:7:dup\nnot/there.ts:3:x\nrandom output', cwd, null);
assert.deepStrictEqual(hits, [{ file: api, line: 7 }], 'file:line, no duplicates, no missing files');

hits = findHits(`${api}:12:x`, os.tmpdir(), null);
assert.deepStrictEqual(hits, [{ file: api, line: 12 }], 'absolute path (with drive letter on Windows)');

const sole = grepSoleFile('grep -n "useX" lib/api.ts', cwd);
assert.strictEqual(sole, api, 'grep on a single file');
assert.deepStrictEqual(findHits('28:export const useX', cwd, sole), [{ file: api, line: 28 }]);

assert.deepStrictEqual(findHits('lib/api.ts', cwd, null), [{ file: api, line: 1 }], 'plain file list (grep -l / Glob)');

assert.deepStrictEqual(readTarget('sed -n 10,15p lib/api.ts', cwd), { file: api, start: 10, count: 6 });
assert.deepStrictEqual(readTarget('head -n 5 lib/api.ts', cwd), { file: api, start: 1, count: 5 });
assert.deepStrictEqual(readTarget('tail -3 lib/api.ts', cwd), { file: api, start: 47, count: 3 });
assert.deepStrictEqual(readTarget('cat lib/api.ts', cwd), { file: api });
assert.strictEqual(readTarget('grep -rn x lib | head -5', cwd), null, 'head in a pipe is not a file read');

fs.rmSync(root, { recursive: true });

// ---- level: 10 min to lv 2, then 10 more per level, no cap ----
const { levelOf, fmtDuration } = require('./extension/out/level.js');
assert.strictEqual(levelOf(0).level, 1);
assert.strictEqual(levelOf(599).level, 1);
assert.strictEqual(levelOf(600).level, 2, '10 min of agent work = lv 2');
assert.strictEqual(levelOf(1799).level, 2);
assert.strictEqual(levelOf(1800).level, 3, '+20 min = lv 3');
for (const s of [0, 1, 599, 600, 12345, 1e6, 1e9]) {
  const { level, progress, toNext } = levelOf(s);
  assert.ok(progress >= 0 && progress < 1 && toNext > 0, `progress in range at ${s}s`);
  assert.ok(levelOf(s + toNext).level === level + 1, `toNext lands on the next level at ${s}s`);
}
assert.ok(levelOf(1e9).level > 1000, 'no level cap');
assert.strictEqual(fmtDuration(42), '42s');
assert.strictEqual(fmtDuration(17 * 60), '17min');
assert.strictEqual(fmtDuration(3 * 3600 + 5 * 60), '3h05');
// i18n key parity is enforced by the compiler (pt is typed as the en shape).

console.log('selfcheck ok');
