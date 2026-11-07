import fs from 'node:fs';
import path from 'node:path';

/** Only app-owned, per-course folders. Never follow junctions or user-provided media paths. */
export function lessonFileTargets(root: string, lessonId: string, jobIds: string[]) {
  const safeId = (id: string) => { if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('课程文件标识无效'); return id; };
  const base = fs.realpathSync(root);
  const targets = [
    path.join(base, 'data', 'media', safeId(lessonId)),
    path.join(base, 'data', 'analysis', safeId(lessonId)),
    ...jobIds.map(id => path.join(base, 'data', 'jobs', safeId(id))),
  ];
  function checkTree(file: string) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw Error('课程目录包含链接，已停止删除以保护原文件');
    if (stat.isDirectory()) for (const entry of fs.readdirSync(file)) checkTree(path.join(file, entry));
  }
  for (const target of targets) {
    if (!target.startsWith(base + path.sep)) throw Error('课程目录超出应用范围');
    let parent = path.dirname(target);
    while (parent !== base) {
      if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw Error('课程目录包含链接，已停止删除');
      parent = path.dirname(parent);
    }
    if (fs.existsSync(target)) checkTree(target);
  }
  return targets;
}
