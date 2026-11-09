import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

let postgres: StartedPostgreSqlContainer | undefined;
let closeDatabase: (() => Promise<void>) | undefined;
let server: Server | undefined;
let baseUrl: string;

before(async () => {
	postgres = await new PostgreSqlContainer('postgres:18-alpine').start();
	process.env.DATABASE_URL = postgres.getConnectionUri();
	delete process.env.CORS_ORIGIN;

	const database = await import('../../src/data/db/client.ts');
	closeDatabase = database.closeDatabase;
	await migrate(database.db, { migrationsFolder: fileURLToPath(new URL('../../drizzle/', import.meta.url)) });

	const { app } = await import('../../src/app.ts');
	server = createServer(app);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

after(async () => {
	try {
		if (server?.listening) {
			await server[Symbol.asyncDispose]();
		}
	} finally {
		try {
			await closeDatabase?.();
		} finally {
			await postgres?.stop();
		}
	}
});

const postObservation = (body: string): Promise<Response> =>
	fetch(`${baseUrl}/observations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body,
	});

const ingest = async (objectId: string, observedAt: string) => {
	const input = { observationId: randomUUID(), objectId, observedAt };
	const response = await postObservation(JSON.stringify(input));
	assert.equal(response.status, 201);

	return { input, response };
};

const getLatest = (objectId: string): Promise<Response> => fetch(`${baseUrl}/objects/${encodeURIComponent(objectId)}/latest`);

test('returns the committed observation in UTC with its resource location', async () => {
	const { input, response } = await ingest('SAT-CREATE', '2026-11-07T13:05:00.123-05:00');
	const expected = { ...input, observedAt: '2026-11-07T18:05:00.123Z' };
	assert.equal(response.headers.get('Location'), `/v1/observations/${input.observationId}`);
	assert.deepEqual(await response.json(), expected);

	const latest = await getLatest(input.objectId);
	assert.equal(latest.status, 200);
	assert.equal(latest.headers.get('Cache-Control'), 'no-store');
	assert.deepEqual(await latest.json(), expected);
});

test('rejects a duplicate observation ID and preserves its original selection', async () => {
	const { input } = await ingest('SAT-DUPLICATE', '2026-11-07T18:05:00.000Z');
	const response = await postObservation(JSON.stringify({ ...input, observedAt: '2026-11-07T19:05:00.000Z' }));
	assert.equal(response.status, 409);
	assert.equal((await response.json()).type, 'conflict');

	const latest = await getLatest(input.objectId);
	assert.deepEqual(await latest.json(), input);
});

test('rejects malformed JSON and invalid observation fields', async () => {
	const valid = { observationId: randomUUID(), objectId: 'SAT-INVALID', observedAt: '2026-11-07T18:05:00.000Z' };
	const invalid = [
		'{',
		JSON.stringify({ ...valid, observationId: 'invalid' }),
		JSON.stringify({ ...valid, objectId: ' ' }),
		JSON.stringify({ ...valid, observedAt: '2026-11-07T18:05:00' }),
		JSON.stringify({ ...valid, observedAt: '0001-01-01T00:00:00+01:00' }),
	];
	for (const body of invalid) {
		const response = await postObservation(body);
		assert.equal(response.status, 400);
		assert.equal((await response.json()).type, 'validation_error');
	}

	assert.equal((await getLatest(valid.objectId)).status, 404);
});

test('returns 404 for an object with no observations', async () => {
	const response = await getLatest('SAT-MISSING');
	assert.equal(response.status, 404);
	assert.equal((await response.json()).type, 'not_found');
});

test('advances the selection for a newer observation and accepts late arrivals', async () => {
	await ingest('SAT-LATE', '2026-11-07T18:05:00.000Z');
	const { input: newer } = await ingest('SAT-LATE', '2026-11-07T18:06:00.000Z');
	const { input: older, response } = await ingest('SAT-LATE', '2026-11-07T18:04:00.000Z');
	assert.deepEqual(await response.json(), older);

	const latest = await getLatest('SAT-LATE');
	assert.deepEqual(await latest.json(), newer);
});

test('keeps the existing selection when two offsets describe the same instant', async () => {
	const { input: first } = await ingest('SAT-TIE', '2026-11-07T18:05:00.000Z');
	await ingest('SAT-TIE', '2026-11-07T13:05:00.000-05:00');

	const latest = await getLatest(first.objectId);
	assert.deepEqual(await latest.json(), first);
});

test('selects the latest observation independently for each object', async () => {
	const { input: first } = await ingest('SAT-A', '2026-11-07T18:05:00.000Z');
	const { input: second } = await ingest('SAT-B', '2026-11-07T18:06:00.000Z');

	assert.deepEqual(await (await getLatest(first.objectId)).json(), first);
	assert.deepEqual(await (await getLatest(second.objectId)).json(), second);
});

test('preserves the public heartbeat with persistence enabled', async () => {
	const response = await fetch(`${baseUrl}/heartbeat`);
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { status: 'ok' });
});
