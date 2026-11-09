import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Stores committed observations with globally unique IDs and millisecond timestamps.
 */
export const observations = pgTable(
	'observations',
	{
		observationId: uuid('observation_id').primaryKey(),
		objectId: text('object_id').notNull(),
		observedAt: timestamp('observed_at', { withTimezone: true, precision: 3 }).notNull(),
	},
	(table) => [unique('observations_object_observation_key').on(table.objectId, table.observationId)],
);
