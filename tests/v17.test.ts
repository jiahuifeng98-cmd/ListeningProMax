import {it,expect} from 'vitest';
import {currencyReading} from '../src/shared/numericReading';
import {counterReading} from '../src/shared/dictionary';
import {normalizeAppearance,appearanceError,defaultAppearance} from '../src/shared/appearance';
it.each([['1万円','いちまんえん'],['１万円','いちまんえん'],['一万円','いちまんえん'],['10000円','いちまんえん'],['10,000円','いちまんえん'],['1万2千300円','いちまんにせんさんびゃくえん'],['一万二千三百円','いちまんにせんさんびゃくえん'],['300円','さんびゃくえん'],['600円','ろっぴゃくえん'],['8000円','はっせんえん'],['1億円','いちおくえん'],['5千円','ごせんえん'],['0円','ぜろえん'],['十円','じゅうえん']])('金额 %s 读作 %s',(query,reading)=>{expect(currencyReading(query)).toBe(reading);expect(counterReading(query)).toBe(reading);});
it.each(['1.5万円','1,00円','-1円','01円','1万万円','百千円','1円玉','円','1000000000000円','1万円札','円山','1億1億円'])('不猜造 %s 读音',query=>expect(currencyReading(query)).toBeUndefined());
it('旧设置使用默认外观，字号分别设置',()=>{expect(normalizeAppearance()).toEqual(defaultAppearance);expect(normalizeAppearance({japaneseSize:32})).toEqual({...defaultAppearance,japaneseSize:32});expect(normalizeAppearance({translationSize:22,theme:'dark'})).toMatchObject({translationSize:22,theme:'dark'});});
it('拒绝异常字号及主题，不污染默认值',()=>{expect(appearanceError({...defaultAppearance,japaneseSize:NaN})).toBeTruthy();expect(appearanceError({...defaultAppearance,theme:'pink' as any})).toBeTruthy();expect(normalizeAppearance({japaneseSize:-1})).toEqual(defaultAppearance);});
