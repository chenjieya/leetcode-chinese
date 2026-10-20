import { describe, expect, it, vi } from 'vitest';
import { TFolder, type App } from 'obsidian';
import { migrateManagedFolders } from '../src/notes/migrateManagedFolders';

function setup(paths: string[], failTarget?: string, caseInsensitive = false) {
  const folders = new Map(paths.map(path => [path, Object.assign(new TFolder(), { path })]));
  const contents = new Map(paths.map(path => [`${path}/笔记.md`, '原始内容 [[其它笔记]]']));
  const renameFile = vi.fn(async (file: TFolder, next: string) => {
    if (next === failTarget) throw new Error('rename failed');
    const old = file.path;
    folders.delete(old);
    file.path = next;
    folders.set(next, file);
    for (const [path, body] of [...contents]) {
      if (!path.startsWith(old + '/')) continue;
      contents.delete(path);
      contents.set(next + path.slice(old.length), body);
    }
  });
  const app = {
    vault: { getAbstractFileByPath: (path: string) => folders.get(path)
      ?? (caseInsensitive ? [...folders.values()].find(f => f.path.toLowerCase() === path.toLowerCase()) : null) },
    fileManager: { renameFile },
  } as unknown as App;
  return { app, folders, contents, renameFile };
}

describe('受管目录小写迁移', () => {
  it('兼容 Windows，仅迁移约定目录，保留内容并可重复执行', async () => {
    const m = setup(['leetcode/Patterns', 'leetcode/Techniques', 'leetcode/Contests', 'MyNotes/Patterns'], undefined, true);
    await migrateManagedFolders(m.app, 'leetcode');
    for (const name of ['patterns', 'techniques', 'contests']) {
      expect(m.contents.get(`leetcode/${name}/笔记.md`)).toBe('原始内容 [[其它笔记]]');
    }
    expect(m.folders.has('MyNotes/Patterns')).toBe(true);
    expect(m.renameFile).toHaveBeenCalledTimes(6);
    await migrateManagedFolders(m.app, 'leetcode');
    expect(m.renameFile).toHaveBeenCalledTimes(6);
  });

  it('检测大小写目录冲突后不移动或覆盖任何文件', async () => {
    const m = setup(['leetcode/Patterns', 'leetcode/patterns']);
    await expect(migrateManagedFolders(m.app, 'leetcode')).rejects.toThrow('目录迁移冲突');
    expect(m.renameFile).not.toHaveBeenCalled();
    expect(m.contents.size).toBe(2);
  });

  it('第二步失败后还原原目录和内容', async () => {
    const m = setup(['leetcode/Patterns'], 'leetcode/patterns');
    await expect(migrateManagedFolders(m.app, 'leetcode')).rejects.toThrow('rename failed');
    expect(m.folders.has('leetcode/Patterns')).toBe(true);
    expect(m.contents.get('leetcode/Patterns/笔记.md')).toBe('原始内容 [[其它笔记]]');
    expect(m.folders.has('leetcode/.leetcode-rename-patterns')).toBe(false);
  });
});
