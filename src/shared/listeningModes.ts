import type { LoopMode } from './types';

export const listeningModes = {
  modeNormal: { label: '正常听力', rate: 1, loop: 'off', key: 'Digit1' },
  modeIntensive: { label: '原速精听', rate: 1, loop: 'sentence', key: 'Digit2' },
  modeFast: { label: '快速听力', rate: 1.25, loop: 'off', key: 'Digit3' },
  modeFastIntensive: { label: '快速精听', rate: 1.25, loop: 'sentence', key: 'Digit4' },
} as const;
export type ListeningMode = keyof typeof listeningModes;
export const listeningModeIds = Object.keys(listeningModes) as ListeningMode[];
export function isListeningMode(value: string): value is ListeningMode {
  return Object.hasOwn(listeningModes, value);
}
export function currentListeningMode(rate: number, loop: LoopMode): ListeningMode | undefined {
  return listeningModeIds.find(id => listeningModes[id].rate === rate && listeningModes[id].loop === loop);
}
