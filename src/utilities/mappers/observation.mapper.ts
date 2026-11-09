import type { ObservationDto } from '../../models/dtos/observation.dto.ts';
import type { Observation } from '../../models/entities/observation.model.ts';
import type { SaveObservationInput } from '../../models/validation/observation.validation.ts';

/**
 * Maps between validated input, domain observations, and public responses.
 */
export class ObservationMapper {
	/**
	 * Converts the validated timestamp to the instant stored by the repository.
	 */
	static toEntity(input: SaveObservationInput): Observation {
		return {
			observationId: input.observationId,
			objectId: input.objectId,
			observedAt: new Date(input.observedAt),
		};
	}

	/**
	 * Formats the observation timestamp as an ISO 8601 UTC string.
	 */
	static toDto(observation: Observation): ObservationDto {
		return {
			observationId: observation.observationId,
			objectId: observation.objectId,
			observedAt: observation.observedAt.toISOString(),
		};
	}
}
