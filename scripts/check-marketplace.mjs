import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = name => JSON.parse(readFileSync(join(root, name), 'utf8'));
const manifest = readJson('manifest.json');
const pkg = readJson('package.json');
const versions = readJson('versions.json');
const failures = [];

if (typeof manifest.description !== 'string' ||
    /obsidian/i.test(manifest.description) ||
    manifest.description.length > 250 ||
    !manifest.description.endsWith('.')) {
  failures.push('manifest.json：描述不能包含 Obsidian，长度不超过 250，并以英文句号结尾。');
}
if (manifest.version !== pkg.version || versions[manifest.version] !== manifest.minAppVersion) {
  failures.push('manifest.json、package.json、versions.json 的发布版本不一致。');
}
if (!readFileSync(join(root, 'README.md'), 'utf8').includes('**English overview:**')) {
  failures.push('README.md 缺少项目约定的英文简介。');
}
const lock = readJson('package-lock.json');
for (const [name, entry] of Object.entries(lock.packages)) {
  if (name.endsWith('/node_modules/moment') || name === 'node_modules/moment') {
    if (entry.version !== '2.31.0') failures.push(`${name}：moment 未锁定到已核对的 2.31.0。`);
  }
}

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { scan(path); continue; }
    if (!entry.name.endsWith('.ts')) continue;
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const directive = /^\s*(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\b(.*)/.exec(line);
      if (!directive) return;
      const rules = directive[1].split('--')[0].replace(/\*\/$/, '').trim();
      if (!rules || /\bobsidianmd\//.test(rules)) {
        failures.push(`${path}:${index + 1}：不能整体关闭检查或禁用 Obsidian 规则。`);
      }
    });
  }
}
scan(join(root, 'src'));
if (failures.length) {
  failures.forEach(message => console.error(message));
  process.exitCode = 1;
} else {
  console.log('市场提交预检通过：描述、版本、英文简介、moment 锁定与规则禁用检查。');
}
