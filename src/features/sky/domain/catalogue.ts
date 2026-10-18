import { TIER_ORDER, type ShapeDef, type Tier } from './types';

/**
 * The hand-designed constellations.
 *
 * Coordinates are in the unit square, y pointing down. Points are in growth
 * order — every point after the first shares an edge with an earlier one —
 * which a unit test enforces, so a half-built constellation is always a single
 * connected figure.
 *
 * Keys are persisted on `ConstellationRow.shapeId`, so **never rename or
 * remove one**. Add new shapes; retire old ones by hiding them from the
 * picker instead.
 */
export interface CatalogueEntry {
  name: string;
  tier: Tier;
  shape: ShapeDef;
  /** The shop pack this shape belongs to (M6); absent for the shapes everyone has. */
  pack?: string;
}

export const CATALOGUE = {
  kite: {
    name: 'The Kite',
    tier: 'easy',
    shape: {
      points: [
        [0.5, 0.08],
        [0.82, 0.38],
        [0.5, 0.72],
        [0.18, 0.38],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
    },
  },
  arrow: {
    name: 'The Arrow',
    tier: 'easy',
    shape: {
      points: [
        [0.12, 0.88],
        [0.46, 0.54],
        [0.82, 0.18],
        [0.5, 0.16],
        [0.84, 0.5],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [2, 4],
      ],
    },
  },
  teacup: {
    name: 'The Teacup',
    tier: 'easy',
    shape: {
      points: [
        [0.18, 0.28],
        [0.28, 0.76],
        [0.68, 0.76],
        [0.78, 0.28],
        [0.95, 0.5],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 2],
      ],
    },
  },
  lantern: {
    name: 'The Lantern',
    tier: 'medium',
    shape: {
      points: [
        [0.5, 0.05],
        [0.5, 0.2],
        [0.26, 0.36],
        [0.74, 0.36],
        [0.26, 0.76],
        [0.74, 0.76],
        [0.5, 0.95],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 3],
        [2, 4],
        [3, 5],
        [4, 6],
        [5, 6],
      ],
    },
  },
  swan: {
    name: 'The Swan',
    tier: 'medium',
    shape: {
      points: [
        [0.12, 0.18],
        [0.24, 0.34],
        [0.3, 0.54],
        [0.5, 0.64],
        [0.74, 0.6],
        [0.92, 0.44],
        [0.58, 0.86],
        [0.84, 0.78],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [3, 6],
        [4, 7],
        [6, 7],
      ],
    },
  },
  harp: {
    name: 'The Harp',
    tier: 'medium',
    shape: {
      points: [
        [0.2, 0.9],
        [0.2, 0.6],
        [0.25, 0.3],
        [0.4, 0.1],
        [0.6, 0.15],
        [0.8, 0.3],
        [0.85, 0.6],
        [0.7, 0.9],
        [0.45, 0.9],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 8],
        [8, 0],
        [2, 5],
      ],
    },
  },
  heron: {
    name: 'The Great Heron',
    tier: 'hard',
    shape: {
      points: [
        [0.06, 0.14],
        [0.2, 0.2],
        [0.3, 0.28],
        [0.33, 0.42],
        [0.3, 0.55],
        [0.45, 0.62],
        [0.65, 0.56],
        [0.84, 0.46],
        [0.96, 0.56],
        [0.56, 0.34],
        [0.76, 0.24],
        [0.48, 0.78],
        [0.44, 0.95],
        [0.6, 0.95],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 8],
        [5, 9],
        [9, 10],
        [10, 7],
        [5, 11],
        [11, 12],
        [11, 13],
      ],
    },
  },
  lighthouse: {
    name: 'The Lighthouse',
    tier: 'hard',
    shape: {
      points: [
        [0.35, 0.95],
        [0.65, 0.95],
        [0.6, 0.66],
        [0.4, 0.66],
        [0.42, 0.42],
        [0.58, 0.42],
        [0.5, 0.26],
        [0.18, 0.14],
        [0.14, 0.32],
        [0.82, 0.14],
        [0.86, 0.32],
        [0.5, 0.06],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [3, 4],
        [2, 5],
        [4, 5],
        [4, 6],
        [5, 6],
        [6, 7],
        [6, 8],
        [6, 9],
        [6, 10],
        [6, 11],
      ],
    },
  },
  whale: {
    name: 'The Whale',
    tier: 'hard',
    shape: {
      points: [
        [0.08, 0.5],
        [0.18, 0.36],
        [0.4, 0.3],
        [0.6, 0.32],
        [0.78, 0.42],
        [0.88, 0.36],
        [0.97, 0.22],
        [0.98, 0.5],
        [0.7, 0.62],
        [0.5, 0.68],
        [0.3, 0.66],
        [0.15, 0.6],
        [0.45, 0.82],
        [0.6, 0.86],
        [0.4, 0.14],
        [0.32, 0.04],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 6],
        [5, 7],
        [4, 8],
        [8, 9],
        [9, 10],
        [10, 11],
        [11, 0],
        [9, 12],
        [12, 13],
        [2, 14],
        [14, 15],
      ],
    },
  },

  // Constellation packs (M6): sold in the shop, one easy, one medium and one
  // hard shape each. Same rules as every other entry; the picker shows a pack's
  // shapes only to someone who owns it.
  fox: {
    name: 'The Fox',
    tier: 'easy',
    pack: 'woodland',
    shape: {
      points: [
        [0.2, 0.15],
        [0.3, 0.45],
        [0.5, 0.82],
        [0.7, 0.45],
        [0.8, 0.15],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [1, 3],
      ],
    },
  },
  owl: {
    name: 'The Owl',
    tier: 'medium',
    pack: 'woodland',
    shape: {
      points: [
        [0.22, 0.1],
        [0.3, 0.32],
        [0.7, 0.32],
        [0.78, 0.1],
        [0.22, 0.7],
        [0.78, 0.7],
        [0.5, 0.92],
        [0.5, 0.5],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [1, 4],
        [2, 5],
        [4, 6],
        [5, 6],
        [7, 1],
        [7, 2],
      ],
    },
  },
  stag: {
    name: 'The Stag',
    tier: 'hard',
    pack: 'woodland',
    shape: {
      points: [
        [0.12, 0.52],
        [0.26, 0.42],
        [0.4, 0.38],
        [0.55, 0.45],
        [0.82, 0.46],
        [0.9, 0.6],
        [0.84, 0.9],
        [0.6, 0.64],
        [0.42, 0.9],
        [0.3, 0.3],
        [0.22, 0.08],
        [0.4, 0.12],
        [0.34, 0.04],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 6],
        [3, 7],
        [7, 8],
        [5, 7],
        [1, 9],
        [9, 10],
        [9, 11],
        [11, 12],
      ],
    },
  },
  sailboat: {
    name: 'The Sailboat',
    tier: 'easy',
    pack: 'harbour',
    shape: {
      points: [
        [0.5, 0.08],
        [0.5, 0.62],
        [0.84, 0.62],
        [0.72, 0.9],
        [0.2, 0.9],
      ],
      edges: [
        [0, 1],
        [0, 2],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 1],
      ],
    },
  },
  anchor: {
    name: 'The Anchor',
    tier: 'medium',
    pack: 'harbour',
    shape: {
      points: [
        [0.5, 0.06],
        [0.5, 0.26],
        [0.3, 0.26],
        [0.7, 0.26],
        [0.5, 0.84],
        [0.14, 0.62],
        [0.86, 0.62],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [1, 3],
        [1, 4],
        [4, 5],
        [4, 6],
      ],
    },
  },
  galleon: {
    name: 'The Galleon',
    tier: 'hard',
    pack: 'harbour',
    shape: {
      points: [
        [0.06, 0.62],
        [0.2, 0.86],
        [0.8, 0.86],
        [0.94, 0.62],
        [0.35, 0.62],
        [0.68, 0.62],
        [0.35, 0.1],
        [0.68, 0.16],
        [0.14, 0.44],
        [0.52, 0.38],
        [0.84, 0.44],
        [0.78, 0.06],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [0, 4],
        [4, 5],
        [5, 3],
        [4, 6],
        [5, 7],
        [6, 8],
        [8, 4],
        [6, 9],
        [9, 4],
        [7, 9],
        [9, 5],
        [7, 10],
        [10, 5],
        [7, 11],
      ],
    },
  },
} as const satisfies Record<string, CatalogueEntry>;

export type CatalogueKey = keyof typeof CATALOGUE;

export const catalogueEntry = (key: string): CatalogueEntry | undefined =>
  (CATALOGUE as Record<string, CatalogueEntry>)[key];

/**
 * The shapes offered for a tier: the ones everyone has, plus those of any pack
 * in `ownedPacks`. This only decides what the picker *shows* � a choice already
 * made stays valid whatever is owned, since `resolveDef` doesn't ask.
 */
export const catalogueKeysForTier = (
  tier: Tier,
  ownedPacks: ReadonlySet<string> = new Set(),
): CatalogueKey[] =>
  (Object.keys(CATALOGUE) as CatalogueKey[]).filter((key) => {
    const entry: CatalogueEntry = CATALOGUE[key];
    return entry.tier === tier && (entry.pack === undefined || ownedPacks.has(entry.pack));
  });

/** The shapes of one pack, easiest first, for the shop's preview. */
export const packShapes = (pack: string): { key: CatalogueKey; entry: CatalogueEntry }[] =>
  (Object.keys(CATALOGUE) as CatalogueKey[])
    .map((key): { key: CatalogueKey; entry: CatalogueEntry } => ({ key, entry: CATALOGUE[key] }))
    .filter(({ entry }) => entry.pack === pack)
    .sort((a, b) => TIER_ORDER.indexOf(a.entry.tier) - TIER_ORDER.indexOf(b.entry.tier));

/** Every pack key this build has shapes for; `app/` checks the shop sells only these. */
export const PACK_KEYS: readonly string[] = [
  ...new Set(
    Object.values(CATALOGUE as Record<string, CatalogueEntry>).flatMap((e) =>
      e.pack === undefined ? [] : [e.pack],
    ),
  ),
];
