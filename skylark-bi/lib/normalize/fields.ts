import { parse, isValid, format } from "date-fns";
import type { MondayItem, MondayColumnValue, Money } from "@/lib/types";

/**
 * Low-level parsers + per-item column access. Column *selection* (which column
 * maps to which business field) is decided once per board in resolve.ts; here
 * we just extract/parse a resolved column id for a given item.
 * Everything is defensive: nothing throws.
 */

const PLACEHOLDERS = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "null",
  "none",
  "nil",
  "tbd",
  "?",
  "unknown",
  "not available",
]);

/** Trim/collapse whitespace; treat common placeholders as missing (null). */
export function cleanText(input: string | null | undefined): string | null {
  if (input == null) return null;
  const t = input.replace(/\s+/g, " ").trim();
  if (PLACEHOLDERS.has(t.toLowerCase())) return null;
  return t;
}

export const normalizeTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Index an item's columns by column id for O(1) resolved-field lookup. */
export function indexById(item: MondayItem): Map<string, MondayColumnValue> {
  const map = new Map<string, MondayColumnValue>();
  for (const c of item.columnValues) map.set(c.id, c);
  return map;
}

/** All non-empty columns keyed by display title (for the `raw` passthrough). */
export function columnMap(item: MondayItem): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of item.columnValues) {
    const text = cleanText(c.text);
    if (text !== null) map[c.title] = text;
  }
  return map;
}

// ── Text ───────────────────────────────────────────────────────────

export function textFrom(cols: Map<string, MondayColumnValue>, colId: string | null): string | null {
  if (!colId) return null;
  return cleanText(cols.get(colId)?.text ?? null);
}

// ── Dates ──────────────────────────────────────────────────────────

const DATE_FORMATS = [
  "yyyy-MM-dd",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "dd-MM-yyyy",
  "MM-dd-yyyy",
  "d MMM yyyy",
  "d MMMM yyyy",
  "MMM d, yyyy",
  "MMMM d, yyyy",
  "dd.MM.yyyy",
  "MMM yyyy",
  "MMMM yyyy",
];

export interface ParsedDate {
  iso: string | null; // yyyy-MM-dd
  invalid: boolean; // present but unparseable
}

function parseDateParts(text: string | null, valueJson: string | null): ParsedDate {
  // Typed date column: value is JSON like {"date":"2024-01-15"}
  if (valueJson) {
    try {
      const parsed = JSON.parse(valueJson) as { date?: string };
      if (parsed?.date) {
        const d = new Date(parsed.date);
        if (isValid(d)) return { iso: format(d, "yyyy-MM-dd"), invalid: false };
      }
    } catch {
      /* fall through to text parsing */
    }
  }

  const clean = cleanText(text);
  if (clean === null) return { iso: null, invalid: false };

  for (const fmt of DATE_FORMATS) {
    const d = parse(clean, fmt, new Date());
    if (isValid(d)) return { iso: format(d, "yyyy-MM-dd"), invalid: false };
  }
  const native = new Date(clean);
  if (isValid(native) && /\d{4}/.test(clean)) {
    return { iso: format(native, "yyyy-MM-dd"), invalid: false };
  }
  return { iso: null, invalid: true };
}

export function dateFrom(cols: Map<string, MondayColumnValue>, colId: string | null): ParsedDate {
  if (!colId) return { iso: null, invalid: false };
  const col = cols.get(colId);
  if (!col) return { iso: null, invalid: false };
  return parseDateParts(col.text, col.value);
}

// ── Currency / amount ──────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  "₹": "INR",
  rs: "INR",
  inr: "INR",
  $: "USD",
  usd: "USD",
  "€": "EUR",
  eur: "EUR",
  "£": "GBP",
  gbp: "GBP",
};

const MULTIPLIERS: { re: RegExp; factor: number }[] = [
  { re: /\b(cr|crore|crores)\b/i, factor: 1e7 },
  { re: /\b(l|lac|lakh|lakhs)\b/i, factor: 1e5 },
  { re: /\b(mn|million|m)\b/i, factor: 1e6 },
  { re: /\b(k|thousand)\b/i, factor: 1e3 },
];

/** Parse a messy monetary string → { amount, currency, raw }. */
export function parseMoney(raw: string | null, defaultCurrency: string): Money {
  const cleaned = cleanText(raw);
  if (cleaned === null) return { amount: null, currency: defaultCurrency, raw: null };

  const lower = cleaned.toLowerCase();

  let currency = defaultCurrency;
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (lower.includes(sym)) {
      currency = code;
      break;
    }
  }

  let factor = 1;
  for (const { re, factor: f } of MULTIPLIERS) {
    if (re.test(lower)) {
      factor = f;
      break;
    }
  }

  const numeric = cleaned.replace(/[^0-9.\-]/g, "");
  if (numeric === "" || numeric === "-" || numeric === ".") {
    return { amount: null, currency, raw: cleaned };
  }
  const parsed = Number.parseFloat(numeric);
  if (Number.isNaN(parsed)) return { amount: null, currency, raw: cleaned };

  return { amount: Math.round(parsed * factor), currency, raw: cleaned };
}

export function moneyFrom(
  cols: Map<string, MondayColumnValue>,
  colId: string | null,
  defaultCurrency: string
): Money {
  const text = colId ? (cols.get(colId)?.text ?? null) : null;
  return parseMoney(text, defaultCurrency);
}
