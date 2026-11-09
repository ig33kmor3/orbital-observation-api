import type { RequestHandler } from 'express';
import { ErrorType } from '../models/enums/error-type.enum.ts';
import { StatusCode } from '../utilities/status-code.ts';

/**
 * Returns the standard error response for a request with no matching route.
 */
export const notFoundHandler: RequestHandler = (_request, response) => {
	response.status(StatusCode.NOT_FOUND).json({
		type: ErrorType.NOT_FOUND,
		status: StatusCode.NOT_FOUND,
		message: 'Route not found',
	});
};
