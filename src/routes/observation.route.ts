import { Router } from 'express';
import { getLatestObservationHandler, saveObservationHandler } from '../controllers/observations.controller.ts';
import { validateLatestObservationParams, validateObservationBody } from '../middlewares/validate-observation.middleware.ts';

/**
 * Public routes for observation ingestion and latest-state lookup.
 */
const router = Router();

/**
 * POST /v1/observations
 */
router.post('/observations', validateObservationBody, saveObservationHandler);

/**
 * GET /v1/objects/:objectId/latest
 */
router.get('/objects/:objectId/latest', validateLatestObservationParams, getLatestObservationHandler);

export default router;
