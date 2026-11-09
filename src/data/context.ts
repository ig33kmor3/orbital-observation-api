import type { Db } from './db/client.ts';
import { ObservationRepository } from './repositories/observation.repository.ts';

/**
 * Provides repositories backed by the shared database client.
 */
export class RepositoryContext {
	readonly observations: ObservationRepository;

	constructor(database: Db) {
		this.observations = new ObservationRepository(database);
	}
}
