import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { globalErrorHandler } from './middlewares/global-error.middleware.ts';
import { notFoundHandler } from './middlewares/not-found.middleware.ts';
import heartbeatRouter from './routes/heartbeat.route.ts';
import observationRouter from './routes/observation.route.ts';

/**
 * Express application with its routes mounted and no listener attached.
 */
export const app = express();

// Apply security headers and CORS to fallback responses as well as resource routes.
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.use('/v1', heartbeatRouter);
app.use('/v1', observationRouter);

// Let resource routes handle requests before falling back to a 404.
app.use(notFoundHandler);
app.use(globalErrorHandler);
