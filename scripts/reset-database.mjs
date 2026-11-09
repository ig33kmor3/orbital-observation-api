import { execFileSync } from 'node:child_process';

const databaseUrl = URL.parse(process.env.DATABASE_URL ?? '');

// Verify the migration target before removing the Compose volume.
if (
	!databaseUrl ||
	!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
	databaseUrl.hostname !== '127.0.0.1' ||
	(databaseUrl.port || '5432') !== '5432' ||
	databaseUrl.pathname !== '/orbital_observation' ||
	databaseUrl.search
) {
	throw new Error('Set DATABASE_URL in .env.development to the local Compose database at 127.0.0.1:5432/orbital_observation.');
}

for (const script of ['db:delete', 'db:start', 'db:migrate']) {
	execFileSync('npm', ['run', script], { stdio: 'inherit' });
}
