import { Router } from 'express';
import { getHeartbeatHandler } from '../controllers/heartbeat.controller.ts';

/**
 * Public routes for checking API liveness.
 */
const router = Router();

/**
 * GET /v1/heartbeat
 */
router.get('/heartbeat', getHeartbeatHandler);

export default router;
