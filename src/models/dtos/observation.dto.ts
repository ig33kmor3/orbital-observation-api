/**
 * The public observation response, with a UTC timestamp at millisecond precision.
 */
export type ObservationDto = {
	observationId: string;
	objectId: string;
	observedAt: string;
};
