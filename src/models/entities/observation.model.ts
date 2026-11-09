/**
 * A committed observation with its timestamp represented as an instant.
 */
export type Observation = {
	observationId: string;
	objectId: string;
	observedAt: Date;
};
