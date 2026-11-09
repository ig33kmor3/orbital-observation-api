import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString: databaseUrl });

/**
 * Shared Drizzle client backed by the application's PostgreSQL pool.
 */
export const db = drizzle({ client: pool });

/**
 * Database client type used by the repository context and its repositories.
 */
export type Db = typeof db;

/**
 * Closes the shared pool after the HTTP listener drains.
 */
export const closeDatabase = (): Promise<void> => pool.end();
