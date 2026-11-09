# Pagination Pattern

Reuse the existing pagination contract. These examples show application-defined cursor encoding and a stable SQL ordering.

## Baseline Example

```ts
// src/data/pagination.model.ts

/**
 * A page of items with a cursor for the next page.
 */
export type Pagination<T> = {
  limit: number;
  nextCursor: string | null;
  items: T[];
};

export const encodeCursor = (key: unknown): string => {
  const jsonString = JSON.stringify(key);
  return Buffer.from(jsonString).toString('base64');
};

export const decodeCursor = (encodedCursor: string): unknown => {
  const jsonString = Buffer.from(encodedCursor, 'base64').toString('utf-8');
  return JSON.parse(jsonString);
};
```

## Usage in a Repository

This query fragment uses the project's SQL schema, query builder, `z`, `ValidationError`, and row mapper. It illustrates the boundary rather than defining
a datastore implementation; keep actual queries and cursor validation inside the repository.

```ts
// Fragment inside a SQL repository: validate the decoded key before building a query.
const cursorKeySchema = z.object({ name: z.string(), id: z.uuid() });
let cursorData;
if (filter.cursor) {
  try {
    cursorData = cursorKeySchema.parse(decodeCursor(filter.cursor));
  } catch {
    throw new ValidationError('Invalid cursor');
  }
}
const rows = await this.db
  .select()
  .from(items)
  .where(cursorData
    ? sql`(${items.name} > ${cursorData.name}) OR (${items.name} = ${cursorData.name} AND ${items.id} > ${cursorData.id})`
    : undefined)
  .orderBy(asc(items.name), asc(items.id))
  .limit(limit + 1);

const hasNextPage = rows.length > limit;
const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

return {
  limit,
  nextCursor: hasNextPage
    ? encodeCursor({
        name: pageRows[pageRows.length - 1].name,
        id: pageRows[pageRows.length - 1].id,
      })
    : null,
  items: pageRows.map(mapRowToItem),
};
```

## Usage in a Controller

For a resource with a list endpoint, add the corresponding query method to its repository.

```ts
const query = response.locals.validated.query;
const paginated = await context.items.findAll(query);
response.status(StatusCode.OK).json(paginated);
```

## Guidance

- If the repository already returns `nextCursor: null` when there is no next page, preserve that response shape
- If the repository already has pagination utilities, extend them instead of introducing a second cursor format.
- If it does not, generate one shared cursor pattern rather than encoding cursors ad hoc in each repository.
- Validate decoded cursor structure and allowed values at the pagination boundary. Catch decoding/JSON/schema failures and translate them
  to the agreed validation response; do not let malformed user cursors become generic database or 500 errors.
- Preserve provider tokens as opaque values and follow the existing transport encoding. This JSON/base64 example suits application-defined
  cursor keys; do not change an existing cursor contract or assume it applies to every provider token.
- Default limit and maximum cap should follow the repository's existing API contract
- For SQL-backed pagination, encode a stable ordered cursor key, not a random UUID by itself
