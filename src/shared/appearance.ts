export type Theme = 'system'|'light'|'dark';
export interface Appearance {theme:Theme;japaneseSize:number;translationSize:number}
export const defaultAppearance:Appearance={theme:'system',japaneseSize:28,translationSize:17};
export const japaneseSizes=[24,26,28,30,32,36];
export const translationSizes=[14,16,17,18,20,22];
export function appearanceError(value:Appearance):string{
 if(!['system','light','dark'].includes(value.theme))return '请选择有效的外观模式';
 if(!japaneseSizes.includes(value.japaneseSize)||!translationSizes.includes(value.translationSize))return '请选择支持的字号';
 return '';
}
export function normalizeAppearance(value?:Partial<Appearance>):Appearance{
 const merged={...defaultAppearance,...value};return appearanceError(merged)?{...defaultAppearance}:merged;
}
