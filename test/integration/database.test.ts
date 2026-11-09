import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { latestObservations } from '../../src/data/db/schema/latest-observation.schema.ts';
import { observations } from '../../src/data/db/schema/observation.schema.ts';

test('applies the checked-in migrations to an empty PostgreSQL database', async () => {
	await using postgres = await new PostgreSqlContainer('postgres:18-alpine').start();
	process.env.DATABASE_URL = postgres.getConnectionUri();
	const { db, closeDatabase } = await import('../../src/data/db/client.ts');

	try {
		const migrationsFolder = fileURLToPath(new URL('../../drizzle/', import.meta.url));
		await migrate(db, { migrationsFolder });

		const pointer = { objectId: 'SAT-1042', observationId: '81be15be-2bc8-4457-8c19-c042019dbe50' };
		const observation = { ...pointer, observedAt: new Date('2026-11-07T13:05:00.123-05:00') };
		await db.insert(observations).values(observation);
		await db.insert(latestObservations).values(pointer);

		assert.deepEqual(await db.select().from(observations), [observation]);
		assert.deepEqual(await db.select().from(latestObservations), [pointer]);
	} finally {
		await closeDatabase();
	}
});
