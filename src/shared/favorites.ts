import type { Favorite } from './types';

export type FavoriteSort = 'default' | 'count';

/** Older versions only kept distinct origins, not repeated collection clicks. */
export function favoriteCount(favorite: Favorite): number {
  return Number.isSafeInteger(favorite.collectionCount) && favorite.collectionCount! > 0
    ? favorite.collectionCount!
    : Math.max(1, favorite.origins.length);
}

export function sortFavorites(favorites: readonly Favorite[], order: FavoriteSort): Favorite[] {
  const rows = [...favorites];
  if (order === 'count') {
    // Stable sort keeps the original order for ties and for sentence favorites.
    rows.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'word' ? -1 : 1;
      return a.kind === 'word' ? favoriteCount(b) - favoriteCount(a) : 0;
    });
  }
  return rows;
}
