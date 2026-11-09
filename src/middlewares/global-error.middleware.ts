import type { NextFunction, Request, Response } from 'express';
import { ErrorType } from '../models/enums/error-type.enum.ts';
import { StatusCode } from '../utilities/status-code.ts';

/**
 * Handles unexpected failures forwarded through the Express middleware chain.
 */
export const globalErrorHandler = (error: unknown, _request: Request, response: Response, next: NextFunction): void => {
	// Let Express handle failures after the response has started.
	if (response.headersSent) {
		next(error);
		return;
	}

	// Map request parsing failures without exposing parser details or request bodies.
	if (error instanceof Error && 'status' in error) {
		const { status } = error;
		if (status === StatusCode.BAD_REQUEST || status === StatusCode.PAYLOAD_TOO_LARGE || status === StatusCode.UNSUPPORTED_MEDIA_TYPE) {
			response.status(status).json({ type: ErrorType.VALIDATION_ERROR, status, message: 'Unable to read request' });
			return;
		}
	}

	// Keep internal diagnostics out of the client response.
	console.error('Unexpected request failure', error);
	response.status(StatusCode.INTERNAL_SERVER_ERROR).json({
		type: ErrorType.INTERNAL_SERVER_ERROR,
		status: StatusCode.INTERNAL_SERVER_ERROR,
		message: 'An unexpected error occurred',
	});
};
