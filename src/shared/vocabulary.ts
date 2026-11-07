/** Low-to-high priority is deliberate: JLPT numbers run in the reverse direction. */
export const vocabularyLevels = ['N5','N4','N3','N2','KY','N1'] as const;
export type VocabularyLevel = typeof vocabularyLevels[number];
export const vocabularyLabels: Record<VocabularyLevel,string> = {N1:'N1',N2:'N2',N3:'N3',N4:'N4',N5:'N5',KY:'考研'};
export interface VocabularySettings { enabled: boolean; levels: VocabularyLevel[] }
export interface VocabularyTag { level?: VocabularyLevel; levels: VocabularyLevel[] }
export interface VocabularySpan extends VocabularyTag { start: number; end: number; word?: string }
export function isVocabularyLevel(value: unknown): value is VocabularyLevel { return vocabularyLevels.includes(value as VocabularyLevel); }
export function vocabularyTag(levels: readonly VocabularyLevel[]): VocabularyTag {
  const sorted = vocabularyLevels.filter(l=>levels.includes(l));
  return {level:sorted[0],levels:sorted};
}
export function normalizeVocabulary(value?: Partial<VocabularySettings>): VocabularySettings {
  return {enabled:value?.enabled===true, levels:Array.isArray(value?.levels)?vocabularyLevels.filter(l=>value.levels!.includes(l)):[...vocabularyLevels]};
}
export function vocabularyError(value: VocabularySettings): string {
  return !value || typeof value.enabled!=='boolean' || !Array.isArray(value.levels) || value.levels.some(l=>!isVocabularyLevel(l)) ? '无效的单词颜色设置' : '';
}
export function vocabularyColor(tag: VocabularyTag, settings: VocabularySettings): VocabularyLevel|'other'|undefined {
  if(!settings.enabled)return;
  return tag.level && settings.levels.includes(tag.level) ? tag.level : 'other';
}
export function vocabularyDescription(tag: VocabularyTag): string {
  return tag.level ? `${vocabularyLabels[tag.level]}${tag.levels.length>1?' · 同时收录：'+tag.levels.map(l=>vocabularyLabels[l]).join('、'):''}` : '未分级';
}
