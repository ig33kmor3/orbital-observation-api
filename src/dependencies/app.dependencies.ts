import { RepositoryContext } from '../data/context.ts';
import { db } from '../data/db/client.ts';

/**
 * Shared repository context backed by the application's database.
 */
export const context = new RepositoryContext(db);
