import type { MondayItem } from "@/lib/types";
import { cleanText, normalizeTitle } from "@/lib/normalize/fields";

/**
 * Schema-level column resolution: decide ONCE per board which monday column
 * maps to each business field, then reuse that mapping for every row.
 *
 * Why: boards often have several similar columns (e.g. an empty "Expected Close
 * Date" and a populated "Tentative Close Date"). A per-row fuzzy match could
 * pick different columns for different rows. Here we pick, among all columns
 * whose title matches the field's aliases, the one with the highest FILL RATE
 * (most non-empty values) — consistent across the whole board.
 */

export type FieldAliases = Record<string, string[]>;
export type ColumnResolution = Record<string, string | null>; // field -> column id

export function resolveColumns(items: MondayItem[], aliases: FieldAliases): ColumnResolution {
  // id -> title (first occurrence wins; iteration order = board column order)
  const titles = new Map<string, string>();
  // id -> count of non-empty cells across all rows
  const fill = new Map<string, number>();

  for (const item of items) {
    for (const c of item.columnValues) {
      if (!titles.has(c.id)) titles.set(c.id, c.title);
      if (cleanText(c.text) !== null) fill.set(c.id, (fill.get(c.id) ?? 0) + 1);
    }
  }

  const resolution: ColumnResolution = {};
  for (const [field, frags] of Object.entries(aliases)) {
    const normFrags = frags.map(normalizeTitle);
    let best: string | null = null;
    let bestFill = -1;
    for (const [id, title] of titles) {
      const nt = normalizeTitle(title);
      if (normFrags.some((f) => nt.includes(f))) {
        const f = fill.get(id) ?? 0;
        if (f > bestFill) {
          bestFill = f;
          best = id; // strict `>` keeps the earliest column on ties
        }
      }
    }
    resolution[field] = best;
  }
  return resolution;
}
