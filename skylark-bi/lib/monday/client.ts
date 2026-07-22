import { getConfig } from "@/lib/config";
import type { MondayItem, MondayColumnValue } from "@/lib/types";
import { FIRST_PAGE_QUERY, NEXT_PAGE_QUERY } from "@/lib/monday/queries";

const MONDAY_API_URL = "https://api.monday.com/v2";
const API_VERSION = "2024-10"; // items_page requires 2023-10+
const PAGE_SIZE = 100; // Monday allows up to 500; 100 keeps complexity low
const MAX_PAGES = 100; // hard safety cap against unbounded loops

/** Typed error so callers can render a graceful message on API failure. */
export class MondayError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "MondayError";
  }
}

// ── Raw GraphQL response shapes ────────────────────────────────────
interface RawColumnValue {
  id: string;
  text: string | null;
  value: string | null;
  type: string;
  column: { title: string } | null;
}
interface RawItem {
  id: string;
  name: string;
  column_values: RawColumnValue[];
}
interface ItemsPage {
  cursor: string | null;
  items: RawItem[];
}
interface FirstPageData {
  boards: { id: string; name: string; items_page: ItemsPage }[] | null;
}
interface NextPageData {
  next_items_page: ItemsPage;
}

async function mondayRequest<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const { MONDAY_TOKEN } = getConfig();

  let res: Response;
  try {
    res = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: MONDAY_TOKEN,
        "API-Version": API_VERSION,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store", // always live — no stale caching
    });
  } catch (err) {
    throw new MondayError("Could not reach monday.com. Check your network.", err);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new MondayError("monday.com rejected the API token (401/403).");
    }
    if (res.status === 429) {
      throw new MondayError("monday.com rate limit hit (429). Try again shortly.");
    }
    throw new MondayError(`monday.com HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new MondayError(
      `monday.com GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`
    );
  }
  if (!json.data) throw new MondayError("monday.com returned no data.");
  return json.data;
}

function mapColumns(raw: RawColumnValue[]): MondayColumnValue[] {
  return raw.map((c) => ({
    id: c.id,
    title: c.column?.title ?? c.id,
    text: c.text,
    value: c.value,
    type: c.type,
  }));
}

function toItem(raw: RawItem): MondayItem {
  return { id: raw.id, name: raw.name, columnValues: mapColumns(raw.column_values) };
}

/**
 * Fetch every item from a board, following cursor pagination to completion.
 * Returns raw (untyped-business) items; normalization happens downstream.
 */
export async function fetchBoardItems(boardId: string): Promise<MondayItem[]> {
  const first = await mondayRequest<FirstPageData>(FIRST_PAGE_QUERY, {
    boardId: [boardId],
    limit: PAGE_SIZE,
  });

  const board = first.boards?.[0];
  if (!board) {
    throw new MondayError(
      `Board ${boardId} not found or not accessible with this token.`
    );
  }

  const items: MondayItem[] = board.items_page.items.map(toItem);
  let cursor = board.items_page.cursor;
  let pages = 1;

  while (cursor && pages < MAX_PAGES) {
    const next = await mondayRequest<NextPageData>(NEXT_PAGE_QUERY, {
      cursor,
      limit: PAGE_SIZE,
    });
    items.push(...next.next_items_page.items.map(toItem));
    cursor = next.next_items_page.cursor;
    pages += 1;
  }

  return items;
}

/** Convenience: fetch both boards in parallel. */
export async function fetchBoards(): Promise<{
  dealsRaw: MondayItem[];
  workOrdersRaw: MondayItem[];
}> {
  const { MONDAY_DEALS_BOARD_ID, MONDAY_WORKORDERS_BOARD_ID } = getConfig();
  const [dealsRaw, workOrdersRaw] = await Promise.all([
    fetchBoardItems(MONDAY_DEALS_BOARD_ID),
    fetchBoardItems(MONDAY_WORKORDERS_BOARD_ID),
  ]);
  return { dealsRaw, workOrdersRaw };
}
