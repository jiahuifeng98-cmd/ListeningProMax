import {it,expect} from 'vitest';
import {counterReading} from '../src/shared/dictionary';
import {defaultShortcuts,normalizeShortcuts,shortcutError,shortcutAction} from '../src/shared/shortcuts';
it.each([['3週間','さんしゅうかん'],['３週間','さんしゅうかん'],['1週間','いっしゅうかん'],['8週間','はっしゅうかん'],['10週間','じゅっしゅうかん'],['21週間','にじゅういっしゅうかん'],['6か月','ろっかげつ'],['4年','よねん'],['24年','にじゅうよねん'],['300年','さんびゃくねん']])('数字助数词 %s → %s',(q,reading)=>expect(counterReading(q)).toBe(reading));
it.each(['3月','4日','一日','3週間ほど','3.5週間','003週間','鈴木','0週間','10000年'])('不猜测未支持的读音 %s',q=>expect(counterReading(q)).toBeUndefined());
it('旧设置补齐默认快捷键',()=>{expect(normalizeShortcuts()).toEqual(defaultShortcuts);expect(normalizeShortcuts({loop:'KeyR'}).loop).toBe('KeyR');});
it('拒绝冲突和组合键，允许未绑定',()=>{expect(shortcutError({...defaultShortcuts,loop:'Space'})).toContain('重复');expect(shortcutError({...defaultShortcuts,play:'Ctrl+P'})).toContain('单键');expect(shortcutError({...defaultShortcuts,play:'',loop:''})).toBe('');});
it('自定义映射替换默认按键',()=>{const keys={...defaultShortcuts,loop:'KeyR'};expect(shortcutAction(keys,'KeyR')).toBe('loop');expect(shortcutAction(keys,'Shift')).toBeUndefined();expect(normalizeShortcuts({...keys,next:'KeyR'})).toEqual(defaultShortcuts);});
