# Repository Pattern

Keep persistence behind repositories, with one shared context when several repositories work together. Preserve the existing repository
contracts, classes, and `dependencies/` composition. Controllers orchestrate, services implement domain workflows and integrations, and
repositories own queries, transactions, record mapping, and persistence error translation.

Reuse existing repository contracts and adapters. When repositories already have a configured client, pass it directly.

## Drizzle Example

This example uses the `Item` shape from [model-pattern.md](model-pattern.md) and an existing `items` table with matching fields,
including string-mode timestamps. Map database records in the repository when their shape differs from the entity.

For new contracts, return `null` from a lookup when no row exists. Throw `NotFoundError` when an update that requires an existing row
matches nothing. The HTTP layer translates that error to 404. Preserve existing deletion semantics and error contracts.

```ts
// src/data/db/client.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString: databaseUrl });

/**
 * Shared Drizzle client for the application.
 */
export const db = drizzle({ client: pool });

/**
 * Configured client type for repositories and context.
 */
export type Db = typeof db;

/**
 * Releases the shared database pool during shutdown.
 */
export const closeDatabase = (): Promise<void> => pool.end();
```

```ts
// src/data/repositories/item.repository.ts
import { eq } from 'drizzle-orm';
import type { Item } from '../../models/entities/item.model.ts';
import { NotFoundError } from '../../utilities/errors.ts';
import type { Db } from '../db/client.ts';
import { items } from '../db/schema/item.schema.ts';

/**
 * Persists item entities using the configured Drizzle client.
 */
export class ItemRepository {
  constructor(private readonly db: Db) {}

  /**
   * Finds an item by ID.
   * @param id Item identifier.
   * @returns The stored item or null if absent.
   * @throws When the query fails.
   */
  async findById(id: string): Promise<Item | null> {
    const [item] = await this.db.select().from(items).where(eq(items.id, id));
    return item ?? null;
  }

  /**
   * Inserts an item and returns the persisted entity.
   * @param item Item entity to persist.
   * @returns The stored item.
   * @throws When the insert fails or returns no row.
   */
  async create(item: Item): Promise<Item> {
    try {
      const [saved] = await this.db.insert(items).values(item).returning();
      if (!saved) {
        throw new Error('Item insert returned no row');
      }

      return saved;
    } catch (error) {
      throw new Error('Unable to save item', { cause: error });
    }
  }

  /**
   * Updates an existing item.
   * @param id Item identifier.
   * @param changes Fields to update.
   * @returns The updated item.
   * @throws NotFoundError if no row matches, or a query error if the write fails.
   */
  async update(id: string, changes: Pick<Item, 'name' | 'modifiedAt'>): Promise<Item> {
    const [updated] = await this.db.update(items).set(changes).where(eq(items.id, id)).returning();
    if (!updated) {
      throw new NotFoundError('Item not found');
    }

    return updated;
  }
}
```

```ts
// src/data/context.ts
import type { Db } from './db/client.ts';
import { ItemRepository } from './repositories/item.repository.ts';

/**
 * Provides repositories backed by one database client.
 */
export class RepositoryContext {
  readonly items: ItemRepository;

  constructor(database: Db) {
    this.items = new ItemRepository(database);
  }
}
```

```ts
// src/dependencies/app.dependencies.ts
import { RepositoryContext } from '../data/context.ts';
import { db } from '../data/db/client.ts';

/**
 * Shared repositories for application handlers.
 */
export const context = new RepositoryContext(db);
```

Map validated input to an entity or domain update fields before calling the repository. See the [controller example](controller-pattern.md).
When the application distinguishes conflicts, translate known constraint failures where the query runs. Preserve diagnostic causes for
logging and keep driver details out of public responses.

Use a service for workflows or external storage rather than moving datastore calls into a controller. Multi-row changes that form one
invariant belong in a transaction; cross-system work needs explicit failure/retry semantics. Consult
[storage-cleanup-pattern.md](storage-cleanup-pattern.md) only when the requested flow needs it.
