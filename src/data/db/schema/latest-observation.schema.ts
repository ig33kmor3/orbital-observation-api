import { foreignKey, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { observations } from './observation.schema.ts';

/**
 * Stores one latest-observation pointer per object and requires that it point to an observation for that object.
 */
export const latestObservations = pgTable(
	'latest_observations',
	{
		objectId: text('object_id').primaryKey(),
		observationId: uuid('observation_id').notNull(),
	},
	(table) => [
		foreignKey({
			name: 'latest_observations_observation_fk',
			columns: [table.objectId, table.observationId],
			foreignColumns: [observations.objectId, observations.observationId],
		}),
	],
);
