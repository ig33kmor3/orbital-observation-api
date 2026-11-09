import type { RequestHandler } from 'express';
import { ErrorType } from '../models/enums/error-type.enum.ts';
import { latestObservationParamsSchema, saveObservationSchema } from '../models/validation/observation.validation.ts';
import { StatusCode } from '../utilities/status-code.ts';

/**
 * Rejects invalid observation bodies before they reach the controller.
 */
export const validateObservationBody: RequestHandler = (request, response, next) => {
	const bodyValidation = saveObservationSchema.safeParse(request.body);
	if (!bodyValidation.success) {
		response.status(StatusCode.BAD_REQUEST).json({
			type: ErrorType.VALIDATION_ERROR,
			status: StatusCode.BAD_REQUEST,
			message: 'Provide a valid observationId, objectId, and offset-bearing observedAt timestamp',
		});
		return;
	}

	next();
};

/**
 * Rejects invalid object identifiers before the latest-observation lookup.
 */
export const validateLatestObservationParams: RequestHandler = (request, response, next) => {
	const paramsValidation = latestObservationParamsSchema.safeParse(request.params);
	if (!paramsValidation.success) {
		response.status(StatusCode.BAD_REQUEST).json({
			type: ErrorType.VALIDATION_ERROR,
			status: StatusCode.BAD_REQUEST,
			message: 'Provide a valid objectId',
		});
		return;
	}

	next();
};
