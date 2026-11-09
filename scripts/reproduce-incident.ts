import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';

const observationSchema = z.object({
	observationId: z.uuid(),
	objectId: z.string(),
	observedAt: z.iso.datetime({ offset: true }),
});

type Observation = z.infer<typeof observationSchema>;
type Profile = {
	baseUrl: string;
	observations: number;
	concurrency: number;
	objects: number;
	rounds: number;
	seed: number;
	timeoutMs: number;
};
type Submission = {
	observation: Observation;
	// An absent status means the client could not finish reading the response.
	status?: number;
};

const resultSection: string[] = [];
const report: string[] = [];

/**
 * Runs the configured workload and returns its CLI exit code.
 */
const main = async (): Promise<number> => {
	const profile = readProfile();
	const runId = randomUUID();
	const started = performance.now();
	const random = createRandom(profile.seed);
	let hasMismatch = false;
	let hasFailure = false;

	report.push(
		'## Workload',
		'',
		'| Setting | Value |',
		'| --- | --- |',
		`| API | ${profile.baseUrl} |`,
		`| Observations per round | ${profile.observations} |`,
		`| Maximum concurrent requests | ${profile.concurrency} |`,
		`| Objects per round | ${profile.objects} |`,
		`| Rounds | ${profile.rounds} |`,
		`| Seed | ${profile.seed} |`,
		`| Request timeout | ${profile.timeoutMs} ms |`,
		`| Run ID | ${runId} |`,
		'',
	);

	// Finish each round before starting the next so each report covers a separate batch.
	for (let round = 1; round <= profile.rounds; round++) {
		const observations = generateObservations(profile, runId, round, random);
		const result = await runRound(profile, round, observations);
		hasMismatch ||= result.hasMismatch;
		hasFailure ||= result.hasFailure;
	}

	const elapsed = Math.round(performance.now() - started);

	// Preserve a confirmed mismatch in the exit code even if another object could not be verified.
	if (hasMismatch) {
		resultSection.push('**Data consistency failure**', '', `Elapsed time: ${elapsed} ms`);
		return 1;
	}
	if (hasFailure) {
		resultSection.push('**Request or verification failure**', '', `Elapsed time: ${elapsed} ms`);
		return 2;
	}

	resultSection.push('**No mismatch observed**', '', `Elapsed time: ${elapsed} ms`);
	return 0;
};

/**
 * Submits a batch, establishes the expected latest observation for each object, and reports the results.
 */
const runRound = async (
	profile: Profile,
	round: number,
	observations: Observation[],
): Promise<{ hasMismatch: boolean; hasFailure: boolean }> => {
	const started = performance.now();
	const submissions = await submitObservations(profile, observations);
	report.push(`## Round ${round}`, '');
	const expectedByObject = new Map<string, Observation>();
	const ambiguousObjects = new Set<string>();
	let committed = 0;
	let httpFailures = 0;
	let transportFailures = 0;

	// Build the expected state from confirmed commits. A lost response or server failure leaves the commit uncertain.
	for (const { observation, status } of submissions) {
		if (status === 201) {
			committed++;
			const current = expectedByObject.get(observation.objectId);

			// Generated timestamps are UTC strings with fixed precision, so string order matches chronological order.
			if (!current || observation.observedAt > current.observedAt) {
				expectedByObject.set(observation.objectId, observation);
			}
			continue;
		}

		if (status === undefined) {
			transportFailures++;
			ambiguousObjects.add(observation.objectId);
			continue;
		}

		httpFailures++;
		report.push(`- Submission failed for \`${observation.objectId}\`: HTTP ${status}`, '');
		if (status < 400 || status >= 500) {
			ambiguousObjects.add(observation.objectId);
		}
	}

	let mismatches = 0;
	let inconclusive = 0;
	let verificationFailures = 0;

	// A definitive comparison requires at least one confirmed commit and no uncertain writes for the object.
	const objectIds = new Set(observations.map(({ objectId }) => objectId));
	for (const objectId of objectIds) {
		const expected = expectedByObject.get(objectId);
		if (ambiguousObjects.has(objectId) || !expected) {
			inconclusive++;
			const reason = ambiguousObjects.has(objectId) ? 'commit outcome unknown' : 'no confirmed commits';
			report.push(`- Inconclusive result for \`${objectId}\`: ${reason}`, '');
			continue;
		}

		try {
			const actual = await readLatest(profile, objectId);
			if (actual.observationId !== expected.observationId || Date.parse(actual.observedAt) !== Date.parse(expected.observedAt)) {
				mismatches++;
				report.push(
					`### Mismatch for \`${objectId}\``,
					'',
					'| | Timestamp | Observation ID |',
					'| --- | --- | --- |',
					`| Expected | ${expected.observedAt} | ${expected.observationId} |`,
					`| Actual | ${actual.observedAt} | ${actual.observationId} |`,
					'',
				);
			}
		} catch (error) {
			verificationFailures++;
			const reason = error instanceof Error ? error.message : 'request failed';
			report.push(`- Verification failed for \`${objectId}\`: ${reason}`, '');
		}
	}

	const elapsed = Math.round(performance.now() - started);
	report.push(
		'### Summary',
		'',
		'| Metric | Value |',
		'| --- | --- |',
		`| Committed | ${committed} |`,
		`| HTTP failures | ${httpFailures} |`,
		`| Transport failures | ${transportFailures} |`,
		`| Mismatches | ${mismatches} |`,
		`| Inconclusive objects | ${inconclusive} |`,
		`| Verification failures | ${verificationFailures} |`,
		`| Elapsed time | ${elapsed} ms |`,
		'',
	);

	return {
		hasMismatch: mismatches > 0,
		hasFailure: httpFailures + transportFailures + inconclusive + verificationFailures > 0,
	};
};

/**
 * Sends the batch with at most one request in flight per worker and collects every outcome.
 */
const submitObservations = async (profile: Profile, observations: Observation[]): Promise<Submission[]> => {
	const submissions: Submission[] = [];
	let nextIndex = 0;

	// Each worker claims one observation before awaiting its response.
	await Promise.all(
		Array.from({ length: profile.concurrency }, async () => {
			while (nextIndex < observations.length) {
				const observation = observations[nextIndex];
				nextIndex++;
				const status = await submitObservation(profile, observation);
				submissions.push({ observation, status });
			}
		}),
	);

	return submissions;
};

/**
 * Returns the HTTP status after consuming the response, or undefined when the response is incomplete.
 */
const submitObservation = async (profile: Profile, observation: Observation): Promise<number | undefined> => {
	try {
		const response = await fetch(`${profile.baseUrl}/v1/observations`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(observation),
			redirect: 'error',
			signal: AbortSignal.timeout(profile.timeoutMs),
		});

		// Drain the body so the HTTP connection can be reused.
		await response.arrayBuffer();
		return response.status;
	} catch {
		return undefined;
	}
};

/**
 * Reads and validates the latest observation for the requested object.
 */
const readLatest = async (profile: Profile, objectId: string): Promise<Observation> => {
	const response = await fetch(`${profile.baseUrl}/v1/objects/${encodeURIComponent(objectId)}/latest`, {
		redirect: 'error',
		signal: AbortSignal.timeout(profile.timeoutMs),
	});
	if (response.status !== 200) {
		await response.arrayBuffer();
		throw new Error(`HTTP ${response.status}`);
	}

	const body: unknown = await response.json();
	const validation = observationSchema.safeParse(body);
	if (!validation.success || validation.data.objectId !== objectId) {
		throw new Error('latest response did not match the observation contract');
	}

	return validation.data;
};

/**
 * Generates synthetic observations in a fresh namespace for each invocation and round.
 */
const generateObservations = (profile: Profile, runId: string, round: number, random: () => number): Observation[] => {
	const startTime = Date.UTC(2026, 0, 1);

	// Reuse the configured object set within the round and give each observation a distinct millisecond timestamp.
	const observations = Array.from({ length: profile.observations }, (_, index) => ({
		observationId: randomUUID(),
		objectId: `DEMO-${runId}-${round}-${(index % profile.objects) + 1}`,
		observedAt: new Date(startTime + index).toISOString(),
	}));

	// Shuffle submission order while keeping the timestamp series reproducible from the seed.
	for (let index = observations.length - 1; index > 0; index--) {
		const other = Math.floor(random() * (index + 1));
		[observations[index], observations[other]] = [observations[other], observations[index]];
	}

	return observations;
};

/**
 * Produces a repeatable sequence for shuffling the submission order.
 */
const createRandom = (seed: number): (() => number) => {
	let state = seed;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
};

/**
 * Resolves CLI defaults and validates the target and workload bounds before any requests are sent.
 */
const readProfile = (): Profile => {
	const { values } = parseArgs({
		options: {
			'base-url': { type: 'string', default: 'http://127.0.0.1:3000' },
			observations: { type: 'string', default: '160' },
			concurrency: { type: 'string' },
			objects: { type: 'string' },
			rounds: { type: 'string', default: '2' },
			seed: { type: 'string', default: '73' },
			'timeout-ms': { type: 'string', default: '5000' },
		},
	});

	// Keep the synthetic traffic on a local API and resolve the resource paths from its origin.
	const baseUrl = URL.parse(values['base-url']);
	if (
		!baseUrl ||
		!['http:', 'https:'].includes(baseUrl.protocol) ||
		!['127.0.0.1', 'localhost', '[::1]'].includes(baseUrl.hostname) ||
		baseUrl.pathname !== '/' ||
		baseUrl.username ||
		baseUrl.password ||
		baseUrl.search ||
		baseUrl.hash
	) {
		throw new Error('--base-url must be an HTTP origin on the local machine');
	}

	const observations = readInteger('observations', values.observations, 1, 10000);
	return {
		baseUrl: baseUrl.origin,
		observations,
		concurrency: readInteger('concurrency', values.concurrency ?? String(Math.min(observations, 80)), 1, Math.min(observations, 200)),
		objects: readInteger('objects', values.objects ?? String(Math.min(observations, 4)), 1, observations),
		rounds: readInteger('rounds', values.rounds, 1, 100),
		seed: readInteger('seed', values.seed, 0, 2 ** 32 - 1),
		timeoutMs: readInteger('timeout-ms', values['timeout-ms'], 1, 60000),
	};
};

const readInteger = (name: string, input: string, minimum: number, maximum: number): number => {
	const value = Number(input);
	if (!/^\d+$/.test(input) || value < minimum || value > maximum) {
		throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}`);
	}

	return value;
};

try {
	process.exitCode = await main();
} catch (error) {
	const message = error instanceof Error ? error.message : 'Unable to run observation workload';
	resultSection.push('**Unable to complete workload**', '', message);
	process.exitCode = 2;
}

try {
	const outputDirectory = new URL('../.output/', import.meta.url);
	const timestamp = new Date().toISOString().replaceAll(':', '-');
	const outputFile = new URL(`results-${timestamp}-${process.pid}.md`, outputDirectory);

	// Keep separate invocations from overwriting each other's reports.
	await mkdir(outputDirectory, { recursive: true });
	const sections = ['# Observation workload results', '', '## Result', '', ...resultSection, '', ...report];
	await writeFile(outputFile, `${sections.join('\n').trimEnd()}\n`, { flag: 'wx' });
	console.log(`Report saved to ${fileURLToPath(outputFile)}`);
} catch (error) {
	console.error('Unable to save workload report', error);
	process.exitCode = 2;
}
