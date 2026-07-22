/**
 * GraphQL query strings for Monday.com's API (v2).
 *
 * Pagination model: the first page comes from `boards.items_page`, which returns
 * a `cursor`. Subsequent pages are fetched from the top-level `next_items_page`
 * using that cursor until it comes back null. This is Monday's recommended
 * cursor-pagination pattern and avoids silently truncating boards at 25 rows.
 */

// Shared shape for an item's columns (title resolved via `column { title }`).
const ITEM_FIELDS = `
  id
  name
  column_values {
    id
    text
    value
    type
    column { title }
  }
`;

export const FIRST_PAGE_QUERY = `
  query BoardItems($boardId: [ID!], $limit: Int!) {
    boards(ids: $boardId) {
      id
      name
      items_page(limit: $limit) {
        cursor
        items { ${ITEM_FIELDS} }
      }
    }
  }
`;

export const NEXT_PAGE_QUERY = `
  query NextItems($cursor: String!, $limit: Int!) {
    next_items_page(cursor: $cursor, limit: $limit) {
      cursor
      items { ${ITEM_FIELDS} }
    }
  }
`;
