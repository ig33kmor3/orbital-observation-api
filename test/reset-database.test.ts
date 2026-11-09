import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempDisposableSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const resetScript = fileURLToPath(new URL('../scripts/reset-database.mjs', import.meta.url));

test('runs delete, start, and migrate with the development database URL', () => {
	const databaseUrl = 'postgresql://127.0.0.1:5432/orbital_observation';
	const result = runReset(databaseUrl);

	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(result.commands, ['run db:delete', 'run db:start', 'run db:migrate']);
});

test('rejects a nonlocal development database before running any reset commands', () => {
	const result = runReset('postgresql://remote.example.invalid:5432/orbital_observation');

	assert.equal(result.status, 1);
	assert.match(result.stderr, /Set DATABASE_URL in \.env\.development to the local Compose database/);
	assert.deepEqual(result.commands, []);
});

const runReset = (databaseUrl: string) => {
	using fixture = mkdtempDisposableSync(join(tmpdir(), 'orbital-db-reset-'));
	const bin = join(fixture.path, 'bin');
	const commandLog = join(fixture.path, 'commands.log');

	mkdirSync(bin);
	writeFileSync(commandLog, '');
	writeFileSync(join(fixture.path, '.env.development'), `DATABASE_URL=${databaseUrl}\n`);
	writeFileSync(join(bin, 'npm'), '#!/bin/sh\n[ "$DATABASE_URL" = "$EXPECTED_URL" ] || exit 2\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\n', {
		mode: 0o755,
	});

	const result = spawnSync(process.execPath, ['--env-file=.env.development', resetScript], {
		cwd: fixture.path,
		env: { PATH: bin, EXPECTED_URL: databaseUrl, COMMAND_LOG: commandLog },
		encoding: 'utf8',
		timeout: 5000,
	});

	return {
		status: result.status,
		stderr: result.stderr,
		commands: readFileSync(commandLog, 'utf8').trim().split('\n').filter(Boolean),
	};
};
