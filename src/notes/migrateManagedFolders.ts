import { TFolder, type App } from 'obsidian';

/** 仅迁移插件约定的子目录；通过两次重命名兼容 Windows 的大小写不敏感文件系统。 */
export async function migrateManagedFolders(app: App, problemsFolder: string): Promise<void> {
  const root = problemsFolder.replace(/[\\/]+$/, '');
  const plans = ['Patterns', 'Techniques', 'Contests'].flatMap(name => {
    const source = app.vault.getAbstractFileByPath(`${root}/${name}`);
    if (!(source instanceof TFolder) || source.path !== `${root}/${name}`) return [];
    const target = `${root}/${name.toLowerCase()}`;
    const temporary = `${root}/.leetcode-rename-${name.toLowerCase()}`;
    const existing = app.vault.getAbstractFileByPath(target);
    if ((existing && existing !== source) || app.vault.getAbstractFileByPath(temporary)) {
      throw new Error(`目录迁移冲突：${source.path} → ${target}，请先合并同名目录。`);
    }
    return [{ source, original: source.path, target, temporary }];
  });

  for (const { source, original, target, temporary } of plans) {
    await app.fileManager.renameFile(source, temporary);
    try {
      await app.fileManager.renameFile(source, target);
    } catch (error) {
      // 第二步失败时还原原路径，不删除任何文件。
      await app.fileManager.renameFile(source, original);
      throw error;
    }
  }
}
