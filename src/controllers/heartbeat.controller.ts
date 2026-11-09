import type { RequestHandler } from 'express';
import { StatusCode } from '../utilities/status-code.ts';

/**
 * GET /v1/heartbeat
 * Reports that the API can serve requests.
 */
export const getHeartbeatHandler: RequestHandler = (_request, response) => {
	// Require each liveness probe to reach the API.
	response.set('Cache-Control', 'no-store');
	response.status(StatusCode.OK).json({ status: 'ok' });
};
