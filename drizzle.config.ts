import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;

/**
 * Drizzle configuration for the PostgreSQL database.
 */
export default defineConfig({
	dialect: 'postgresql',
	schema: './src/data/db/schema/*.schema.ts',
	out: './drizzle',
	// Use the DATABASE_URL environment variable if available for database credentials
	...(url ? { dbCredentials: { url } } : {}),
});
