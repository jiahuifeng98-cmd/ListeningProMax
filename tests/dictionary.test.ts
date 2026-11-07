import {it,expect} from 'vitest';
import {glosses,plainText} from '../src/shared/dictionary';
it('提取核心中文释义，排除例句和署名',()=>{expect(glosses([{type:'structured-content',content:[{tag:'div',content:[{tag:'ul',data:{content:'glossary'},content:[{tag:'li',content:'吃'},{tag:'li',content:'以……为生'}]},{data:{content:'example'},content:'example text'}]},{data:{content:'attribution'},content:'JMdict'}]}])).toEqual(['吃','以……为生']);});
it('富文本节点不能插入多余分号或重复注音',()=>{expect(plainText(['公',{tag:'ruby',content:['園',{tag:'rt',content:'えん'}]},'に行く。'])).toBe('公園に行く。');});
it('支持旧版字符串词典',()=>expect(glosses(['first sense','second sense'])).toEqual(['first sense','second sense']));
