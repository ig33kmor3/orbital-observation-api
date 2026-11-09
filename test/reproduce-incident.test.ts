import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const observationSchema = z.object({ observationId: z.string(), objectId: z.string(), observedAt: z.string() });
type Observation = z.infer<typeof observationSchema>;
type FixtureMode = 'clean' | 'stale' | 'reject-newest' | 'disconnect' | 'lookup-failure';

test('bounds concurrent submissions and verifies every object after each round', async () => {
	const result = await runWorkload('clean', ['--rounds', '2', '--objects', '2']);

	assert.equal(result.status, 0, result.output);
	assert.equal(result.peakPosts, 2);
	assert.equal(result.readDuringSubmission, false);
	assert.equal(result.observations.length, 8);
	assert.equal(new Set(result.observations.map(({ observationId }) => observationId)).size, 8);
	assert.equal(new Set(result.observations.map(({ objectId }) => objectId)).size, 4);
	assert.equal(result.lookupCount, 4);
	assert.deepEqual(result.lookupSubmissionCounts, [4, 4, 8, 8]);
	assert.match(result.output, /\*\*No mismatch observed\*\*/);
});

test('reports the expected and actual timestamps when latest state regresses', async () => {
	const result = await runWorkload('stale');

	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /\| Committed \| 4 \|/);
	assert.match(result.output, /\| Mismatches \| 1 \|/);
	assert.match(result.output, /\| Expected \| 2026-01-01T00:00:00\.003Z \|/);
	assert.match(result.output, /\| Actual \| 2026-01-01T00:00:00\.000Z \|/);
});

test('excludes rejected submissions from the expected latest observation', async () => {
	const result = await runWorkload('reject-newest');

	assert.equal(result.status, 2, result.output);
	assert.match(result.output, /Submission failed for .*HTTP 400/);
	assert.match(result.output, /\| Committed \| 3 \|/);
	assert.match(result.output, /\| HTTP failures \| 1 \|/);
	assert.match(result.output, /\| Mismatches \| 0 \|/);
	assert.match(result.output, /\| Inconclusive objects \| 0 \|/);
	assert.equal(result.lookupCount, 1);
});

test('marks an object inconclusive when a submission loses its response', async () => {
	const result = await runWorkload('disconnect');

	assert.equal(result.status, 2, result.output);
	assert.match(result.output, /\| Committed \| 3 \|/);
	assert.match(result.output, /\| HTTP failures \| 0 \|/);
	assert.match(result.output, /\| Transport failures \| 1 \|/);
	assert.match(result.output, /\| Mismatches \| 0 \|/);
	assert.match(result.output, /\| Inconclusive objects \| 1 \|/);
	assert.match(result.output, /commit outcome unknown/);
	assert.equal(result.lookupCount, 0);
});

test('reports a failed latest lookup separately from submission failures', async () => {
	const result = await runWorkload('lookup-failure');

	assert.equal(result.status, 2, result.output);
	assert.match(result.output, /Verification failed for .*HTTP 503/);
	assert.match(result.output, /\| Committed \| 4 \|/);
	assert.match(result.output, /\| HTTP failures \| 0 \|/);
	assert.match(result.output, /\| Transport failures \| 0 \|/);
	assert.match(result.output, /\| Mismatches \| 0 \|/);
	assert.match(result.output, /\| Verification failures \| 1 \|/);
});

test('saves invalid workload settings in a Markdown report', async () => {
	const result = await runWorkload('clean', ['--objects', '0']);

	assert.equal(result.status, 2);
	assert.match(result.output, /\*\*Unable to complete workload\*\*/);
	assert.match(result.output, /--objects must be an integer/);
	assert.equal(result.observations.length, 0);
});

const runWorkload = async (mode: FixtureMode, options: string[] = []) => {
	const observations: Observation[] = [];
	let activePosts = 0;
	let peakPosts = 0;
	let readDuringSubmission = false;
	let lookupCount = 0;
	const lookupSubmissionCounts: number[] = [];
	const firstPair = Promise.withResolvers<void>();

	const server = createServer(async (request, response) => {
		if (request.method === 'POST' && request.url === '/v1/observations') {
			activePosts++;
			peakPosts = Math.max(peakPosts, activePosts);
			if (activePosts === 2) {
				firstPair.resolve();
			}

			try {
				request.setEncoding('utf8');
				let body = '';
				for await (const chunk of request) {
					body += chunk;
				}
				const observation = observationSchema.parse(JSON.parse(body));
				await firstPair.promise;
				await delay(10);

				if (observation.observedAt.endsWith('.003Z')) {
					if (mode === 'reject-newest') {
						response.writeHead(400).end();
						return;
					}
					if (mode === 'disconnect') {
						observations.push(observation);
						request.socket.destroy();
						return;
					}
				}

				observations.push(observation);
				response.writeHead(201).end();
			} finally {
				activePosts--;
			}
			return;
		}

		const path = /^\/v1\/objects\/([^/]+)\/latest$/.exec(request.url ?? '');
		if (request.method !== 'GET' || !path) {
			response.writeHead(404).end();
			return;
		}

		lookupCount++;
		lookupSubmissionCounts.push(observations.length);
		readDuringSubmission ||= activePosts > 0;
		if (mode === 'lookup-failure') {
			response.writeHead(503).end();
			return;
		}

		const objectId = decodeURIComponent(path[1]);
		const matching = observations.filter((observation) => observation.objectId === objectId);
		matching.sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
		const latest = mode === 'stale' ? matching[0] : matching.at(-1);
		response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(latest));
	});

	try {
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		const child = spawn(
			'npm',
			[
				'run',
				'--silent',
				'demo:reproduce',
				'--',
				'--base-url',
				`http://127.0.0.1:${address.port}`,
				'--observations',
				'4',
				'--concurrency',
				'2',
				'--objects',
				'1',
				'--rounds',
				'1',
				'--timeout-ms',
				'2000',
				...options,
			],
			{ stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 },
		);

		let terminalOutput = '';
		child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
			terminalOutput += chunk;
		});
		child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
			terminalOutput += chunk;
		});
		const status = await new Promise<number | null>((resolve, reject) => {
			child.once('close', resolve);
			child.once('error', reject);
		});
		const reportPath = /^Report saved to (.+)$/m.exec(terminalOutput);
		assert.ok(reportPath, terminalOutput);
		assert.equal(dirname(reportPath[1]), fileURLToPath(new URL('../.output', import.meta.url)));
		assert.match(basename(reportPath[1]), /^results-\d{4}-\d{2}-\d{2}T[\d.-]+Z-\d+\.md$/);
		assert.equal(terminalOutput.trim(), `Report saved to ${reportPath[1]}`);
		const output = readFileSync(reportPath[1], 'utf8');
		unlinkSync(reportPath[1]);
		assert.match(output, /^# Observation workload results\n\n## Result\n/);
		return { status, output, peakPosts, readDuringSubmission, observations, lookupCount, lookupSubmissionCounts };
	} finally {
		firstPair.resolve();
		server.closeAllConnections();
		await server[Symbol.asyncDispose]();
	}
};
