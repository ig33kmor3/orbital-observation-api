import { z } from 'zod';

const objectId = z
	.string()
	.min(1)
	.max(256)
	.refine((value) => value.trim().length > 0 && value.isWellFormed() && !value.includes('\0'));

/**
 * Validates an observation with a client-supplied UUID and offset-bearing timestamp.
 */
export const saveObservationSchema = z.object({
	observationId: z.uuid(),
	objectId,
	observedAt: z.iso.datetime({ offset: true }).refine((value) => {
		// Keep the UTC instant in the four-digit year range accepted by the database and API.
		const year = new Date(value).getUTCFullYear();
		return year >= 1 && year <= 9999;
	}),
});

/**
 * Validates the object identifier in the latest-observation route.
 */
export const latestObservationParamsSchema = z.object({ objectId });

/**
 * The observation payload after request validation.
 */
export type SaveObservationInput = z.infer<typeof saveObservationSchema>;

/**
 * The latest-observation path parameters after request validation.
 */
export type LatestObservationParams = z.infer<typeof latestObservationParamsSchema>;
