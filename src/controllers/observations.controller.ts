import type { RequestHandler } from 'express';
import { context } from '../dependencies/app.dependencies.ts';
import { ErrorType } from '../models/enums/error-type.enum.ts';
import type { LatestObservationParams, SaveObservationInput } from '../models/validation/observation.validation.ts';
import { ObservationMapper } from '../utilities/mappers/observation.mapper.ts';
import { StatusCode } from '../utilities/status-code.ts';

/**
 * POST /v1/observations
 * Returns the committed observation or a conflict for an existing ID.
 */
export const saveObservationHandler: RequestHandler = async (request, response, next) => {
	const input = request.body as SaveObservationInput;

	try {
		const newObservation = ObservationMapper.toEntity(input);
		const observation = await context.observations.create(newObservation);
		if (!observation) {
			response.status(StatusCode.CONFLICT).json({
				type: ErrorType.CONFLICT,
				status: StatusCode.CONFLICT,
				message: 'Observation ID already exists',
			});
			return;
		}

		response
			.location(`/v1/observations/${observation.observationId}`)
			.status(StatusCode.CREATED)
			.json(ObservationMapper.toDto(observation));
	} catch (error) {
		next(error);
	}
};

/**
 * GET /v1/objects/:objectId/latest
 * Returns the selected observation or a 404 for an object without observations.
 */
export const getLatestObservationHandler: RequestHandler = async (request, response, next) => {
	const { objectId } = request.params as LatestObservationParams;

	try {
		// A cached selection can hide observations committed since the previous read.
		response.set('Cache-Control', 'no-store');
		const observation = await context.observations.findLatest(objectId);
		if (!observation) {
			response.status(StatusCode.NOT_FOUND).json({
				type: ErrorType.NOT_FOUND,
				status: StatusCode.NOT_FOUND,
				message: 'No observations found for object',
			});
			return;
		}

		response.status(StatusCode.OK).json(ObservationMapper.toDto(observation));
	} catch (error) {
		next(error);
	}
};
