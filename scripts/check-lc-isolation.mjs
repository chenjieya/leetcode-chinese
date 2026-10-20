import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// 与原 Bash 门禁使用相同检查规则，支持 Windows、macOS 和 Linux。
const roots = ['api', 'auth', 'browse', 'notes', 'solve', 'graph', 'preview'];
let failed = false;
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      check(path);
      continue;
    }
    readFileSync(path, 'utf8').split(/\r?\n/).forEach((line, index) => {
      if (/obsidianFetch|\bwindow\.fetch\b|\bglobalThis\.fetch\b|^\s*fetch\s*\(/.test(line)) {
        console.error(`${path}:${index + 1}：力扣请求必须通过 requestUrl，不得使用 AI 网络适配器。`);
        failed = true;
      }
    });
  }
}
roots.forEach(root => check(join('src', root)));
if (failed) process.exitCode = 1;
else console.log('力扣与 AI 网络隔离检查通过。');
