import { eq } from 'drizzle-orm';
import type { Observation } from '../../models/entities/observation.model.ts';
import type { Db } from '../db/client.ts';
import { latestObservations } from '../db/schema/latest-observation.schema.ts';
import { observations } from '../db/schema/observation.schema.ts';

/**
 * Owns observation history and per-object latest pointers.
 */
export class ObservationRepository {
	constructor(private readonly db: Db) {}

	/**
	 * Commits the observation and updates its object's latest pointer when appropriate.
	 * @param observation The observation to persist.
	 * @returns The committed observation, or undefined if its ID already exists.
	 * @throws An error with the underlying cause if the transaction fails.
	 */
	async create(observation: Observation): Promise<Observation | undefined> {
		try {
			return await this.db.transaction(async (transaction) => {
				// Fetch the current latest observation for the object.
				const current = await this.selectLatest(transaction, observation.objectId);

				// Let PostgreSQL arbitrate duplicates before changing the object's latest pointer.
				const [saved] = await transaction
					.insert(observations)
					.values(observation)
					.onConflictDoNothing({ target: observations.observationId })
					.returning();
				if (!saved) {
					return undefined;
				}

				// Keep the existing selection when both timestamps represent the same instant.
				if (!current || saved.observedAt > current.observedAt) {
					await transaction
						.insert(latestObservations)
						.values({ objectId: saved.objectId, observationId: saved.observationId })
						.onConflictDoUpdate({
							target: latestObservations.objectId,
							set: { observationId: saved.observationId },
						});
				}

				return saved;
			});
		} catch (error) {
			throw new Error('Unable to save observation', { cause: error });
		}
	}

	/**
	 * Reads the observation currently selected for an object.
	 * @param objectId The opaque identifier of the observed object.
	 * @returns The selected observation, or undefined when the object has no observations.
	 * @throws An error with the underlying cause if the query fails.
	 */
	async findLatest(objectId: string): Promise<Observation | undefined> {
		try {
			return await this.selectLatest(this.db, objectId);
		} catch (error) {
			throw new Error('Unable to read latest observation', { cause: error });
		}
	}

	private async selectLatest(database: Pick<Db, 'select'>, objectId: string): Promise<Observation | undefined> {
		const [selected] = await database
			.select({ observationId: observations.observationId, objectId: observations.objectId, observedAt: observations.observedAt })
			.from(latestObservations)
			.innerJoin(observations, eq(latestObservations.observationId, observations.observationId))
			.where(eq(latestObservations.objectId, objectId));

		return selected;
	}
}
