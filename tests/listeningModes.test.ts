import { describe, expect, it } from 'vitest';
import { currentListeningMode, isListeningMode, listeningModes } from '../src/shared/listeningModes';
import { defaultShortcuts, normalizeShortcuts, shortcutAction, shortcutError } from '../src/shared/shortcuts';

describe('听力模式与旧快捷键兼容',()=>{
  it.each([
    ['Digit1','modeNormal',1,'off'], ['Digit2','modeIntensive',1,'sentence'],
    ['Digit3','modeFast',1.25,'off'], ['Digit4','modeFastIntensive',1.25,'sentence'],
  ] as const)('%s 设置倍速与循环且可从实际状态反推', (key,id,rate,loop)=>{
    expect(shortcutAction(defaultShortcuts,key)).toBe(id);
    expect(listeningModes[id]).toMatchObject({rate,loop});
    expect(currentListeningMode(rate,loop)).toBe(id);
  });
  it('自由倍速不误报成预设模式',()=>{
    expect(currentListeningMode(.75,'sentence')).toBeUndefined();
    expect(isListeningMode('toString')).toBe(false);
  });
  it('迁移只解除占用新增数字键的旧绑定，保留其他自定义',()=>{
    const keys=normalizeShortcuts({play:'KeyP',loop:'Digit2',sidebar:'KeyV'});
    expect(keys.play).toBe('KeyP');expect(keys.sidebar).toBe('KeyV');expect(keys.loop).toBe('');
    expect(keys.modeIntensive).toBe('Digit2');expect(shortcutError(keys)).toBe('');
  });
  it('用户可以更改模式快捷键并得到重复提示',()=>{
    const keys={...defaultShortcuts,modeNormal:'KeyN'};
    expect(shortcutAction(normalizeShortcuts(keys),'KeyN')).toBe('modeNormal');
    expect(shortcutAction(keys,'Digit1')).toBeUndefined();
    expect(shortcutError({...keys,modeFast:'KeyN'})).toContain('重复');
  });
  it('数字小键盘遵循同一绑定，显式未绑定不会被补回',()=>{
    expect(shortcutAction(defaultShortcuts,'Numpad4')).toBe('modeFastIntensive');
    const keys=normalizeShortcuts({...defaultShortcuts,modeFastIntensive:''});
    expect(shortcutAction(keys,'Numpad4')).toBeUndefined();
  });
});
