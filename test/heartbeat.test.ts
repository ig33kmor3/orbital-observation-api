import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';

const browserOrigin = 'https://ui.example.invalid';
process.env.CORS_ORIGIN = browserOrigin;
process.env.DATABASE_URL = 'postgresql://127.0.0.1:1/unused';

const { app } = await import('../src/app.ts');
const { closeDatabase } = await import('../src/data/db/client.ts');
const server = createServer(app);
let baseUrl: string;

before(async () => {
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
	await server[Symbol.asyncDispose]();
	await closeDatabase();
});

test('returns the public heartbeat with caching disabled', async () => {
	const response = await fetch(`${baseUrl}/v1/heartbeat`);

	assert.equal(response.status, 200);
	assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/);
	assert.equal(response.headers.get('cache-control'), 'no-store');
	assert.deepEqual(await response.json(), { status: 'ok' });
});

test('returns the standard error for an unknown route', async () => {
	const response = await fetch(`${baseUrl}/heartbeat`);

	assert.equal(response.status, 404);
	assert.deepEqual(await response.json(), {
		type: 'not_found',
		status: 404,
		message: 'Route not found',
	});
});

test('rejects malformed JSON before route lookup', async () => {
	const response = await fetch(`${baseUrl}/unknown`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{',
	});

	assert.equal(response.status, 400);
	assert.equal((await response.json()).type, 'validation_error');
});

test('answers a browser preflight for the configured origin', async () => {
	const response = await fetch(`${baseUrl}/v1/heartbeat`, {
		method: 'OPTIONS',
		headers: {
			Origin: browserOrigin,
			'Access-Control-Request-Method': 'GET',
		},
	});

	assert.equal(response.status, 204);
	assert.equal(response.headers.get('access-control-allow-origin'), browserOrigin);
});
