/**
 * Stable error categories returned in API responses.
 */
export enum ErrorType {
	VALIDATION_ERROR = 'validation_error',
	CONFLICT = 'conflict',
	NOT_FOUND = 'not_found',
	INTERNAL_SERVER_ERROR = 'internal_server_error',
}
