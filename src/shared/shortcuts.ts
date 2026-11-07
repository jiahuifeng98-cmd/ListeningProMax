import { listeningModes, listeningModeIds } from './listeningModes';
export const shortcutLabels = {
  play: '播放 / 暂停', previous: '上一句', next: '下一句', loop: '切换单句循环',
  backward: '后退 10 秒', forward: '快进 10 秒', original: '显示 / 隐藏原文',
  translation: '显示 / 隐藏中文翻译', sidebar: '展开 / 收起左侧导航',
  modeNormal: '正常听力（1× · 不循环）', modeIntensive: '原速精听（1× · 单句循环）',
  modeFast: '快速听力（1.25× · 不循环）', modeFastIntensive: '快速精听（1.25× · 单句循环）',
} as const;
export type ShortcutAction = keyof typeof shortcutLabels;
export type Shortcuts = Record<ShortcutAction, string>;
export const defaultShortcuts: Shortcuts = {play:'Space',previous:'ArrowLeft',next:'ArrowRight',loop:'Shift',backward:'KeyJ',forward:'KeyL',original:'KeyH',translation:'KeyT',sidebar:'KeyB',modeNormal:'Digit1',modeIntensive:'Digit2',modeFast:'Digit3',modeFastIntensive:'Digit4'};
export const shortcutKeys = ['Space','Shift','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown', ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ',c=>'Key'+c), ...Array.from('0123456789',c=>'Digit'+c)];
export const keyLabel = (key:string) => ({'':'未绑定',Space:'空格',Shift:'Shift',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓'}[key] || key.replace(/^(Key|Digit)/,''));
export function shortcutError(value: Shortcuts): string {
  const used=new Map<string,string>();
  for(const action of Object.keys(shortcutLabels) as ShortcutAction[]){
    const key=value[action];
    if(typeof key!=='string'||(key&&!shortcutKeys.includes(key)))return '仅支持列表中的单键，不支持 Alt / Ctrl 组合键。';
    if(key&&used.has(key))return `${keyLabel(key)} 已用于「${used.get(key)}」，请避免重复。`;
    if(key)used.set(key,shortcutLabels[action]);
  }
  return '';
}
export function normalizeShortcuts(value?: Partial<Shortcuts>): Shortcuts {
  const merged={...defaultShortcuts,...value};
  // Upgrade old settings without resetting unrelated custom keys. Newly added
  // mode defaults own 1–4; only a conflicting legacy binding becomes unbound.
  for(const id of listeningModeIds){
    if(value?.[id]!==undefined)continue;
    for(const action of Object.keys(value||{}) as ShortcutAction[]){
      if(action!==id && value?.[action]===listeningModes[id].key)merged[action]='';
    }
  }
  return shortcutError(merged)?{...defaultShortcuts}:merged;
}
export function shortcutAction(bindings:Shortcuts,code:string):ShortcutAction|undefined {
  // Num Lock digits behave like the number row; modified keys are filtered by the player.
  if(/^Numpad[0-9]$/.test(code))code=code.replace('Numpad','Digit');
  return (Object.keys(shortcutLabels) as ShortcutAction[]).find(a=>bindings[a]===code);
}
