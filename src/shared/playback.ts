import type { Sentence } from './types';

export interface PlaybackSettings { padding: boolean; loopPause: boolean }
export function normalizePlayback(value?: Partial<PlaybackSettings>): PlaybackSettings {
  return {padding: value?.padding !== false, loopPause: value?.loopPause === true};
}
/** Playback padding never changes stored word boundaries or manual anchors. */
export function playbackRange(sentence: Sentence, durationMs: number, padding = true) {
  if (sentence.startMs == null || sentence.endMs == null) return undefined;
  return {
    startMs: Math.max(0, sentence.startMs - (padding ? 500 : 0)),
    endMs: Math.min(durationMs > 0 ? durationMs : Infinity, sentence.endMs + (padding ? 500 : 0)),
  };
}
