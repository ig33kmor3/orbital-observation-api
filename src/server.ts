import { app } from './app.ts';
import { closeDatabase } from './data/db/client.ts';

/**
 * Owns the HTTP listener lifecycle, from startup configuration through shutdown.
 */
const start = (): void => {
	// Determine the port to listen on, defaulting to 3000 if not specified in the environment.
	const port = Number(process.env.PORT || 3000);
	const server = app.listen(port);

	// Log when the server starts listening.
	server.once('listening', () => {
		// Read the bound port so PORT=0 logs the port chosen by the operating system.
		const address = server.address();
		if (address && typeof address !== 'string') {
			console.log(`Server listening on port ${address.port}`);
		}
	});

	// Stop accepting connections and let active requests finish on shutdown.
	server.once('close', () => {
		void closeDatabase();
	});
	process.once('SIGINT', () => server.close());
	process.once('SIGTERM', () => server.close());
};

/**
 * Start the HTTP server.
 */
start();
