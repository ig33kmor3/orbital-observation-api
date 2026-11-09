# App Pattern

Keep startup responsibilities separate in new apps. The database module owns its connection settings and client. The dependency module
exports the shared repository `context` and any services. `app.ts` exports the configured Express app. `server.ts` starts the listener and
handles shutdown. Supply dependency settings or test substitutes before importing the app. Preserve the project's bootstrap when extending
an existing app.

The filenames are examples, not requirements. Keep an existing `app.ts` entrypoint when appropriate. For Lambda Web Functions, adapt its
listen address using [lambda-web-functions.md](lambda-web-functions.md); preserve the same routes and application layers.

## Standalone Starter

Use Node.js 24, Express 5, TypeScript, Zod 4, Helmet, and CORS. Keep the project's package manager and compatible versions when extending
an existing app.

```bash
npm init
npm install express@5 zod@4 helmet cors
npm install --save-dev typescript tsx @types/express@5 @types/node@24 @types/cors
```

Add database dependencies only for persistence. Add `aws-jwt-verify` when using the Cognito example.

```text
src/
├── app.ts
├── server.ts
├── controllers/
├── middlewares/
├── models/
├── routes/
├── utilities/
├── data/                          # When persistence is needed
│   ├── db/client.ts
│   ├── context.ts
│   └── repositories/
├── dependencies/app.dependencies.ts
├── services/
└── workers/
```

Create only the directories the application uses.

## App Composition

The router declares `/items`, so mount it under `/v1` exactly once. Install `helmet` and `cors` as runtime dependencies and
`@types/cors` as a development dependency. Helmet supplies its own types.

```ts
// src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import itemRoutes from './routes/item.route.ts';
import { globalErrorHandler } from './middlewares/global-error.middleware.ts';
import { NotFoundError } from './utilities/errors.ts';

/**
 * Express application with middleware and routes registered.
 */
export const app = express();

// Apply security and CORS headers before parsing so they reach error responses.
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
app.use(express.json());

app.use('/v1', itemRoutes);
app.get('/heartbeat', (_request, response) => {
  response.json({ status: 'ok' });
});

// A missing route is not automatically an Express error.
app.use((_request, _response, next) => {
  next(new NotFoundError('Route not found'));
});
app.use(globalErrorHandler);
```

The final missing-route middleware forwards to the same Problem Details mapper as other errors. Existing APIs keep their agreed error
contract. Proxies and hosting layers can still emit their own responses; local app tests do not establish their format.

Set `CORS_ORIGIN` to the browser application's origin. With no configured origin, the starter omits CORS headers. Use `*` only for an
intentionally public policy without credentials. Preserve an existing API's origin and credential rules. Configure `trust proxy` for known
hops or addresses when deployed behind a trusted proxy. See [Express behind proxies](https://expressjs.com/en/guide/behind-proxies/).

Mount `app.use(express.json())` once before routers that consume JSON. Add `express.urlencoded()` on endpoints that accept URL-encoded forms. Choose other middleware
for the route or hosting requirement. Use the project's logger for request logs, add compression when the hosting layer leaves it to
Express, and add cookie/session middleware or Multer when routes use cookies, sessions, or multipart uploads. See the
[Express middleware catalog](https://expressjs.com/en/resources/middleware/).

## Process Startup

Load local environment files through the development command below, before this module runs. Production receives injected configuration.
Use the project's module system. The connected snippets below follow the ESM starter's explicit relative `.ts` import convention.

```ts
// src/server.ts
import { app } from './app.ts';

const port = Number(process.env.PORT || 3000);

const server = app.listen(port, (error?: Error) => {
  if (error) {
    console.error('Unable to start HTTP server', error);
    process.exitCode = 1;
    return;
  }
  console.log(`Server running on port ${port}`);
});

const shutdown = (): void => {
  server.close((error) => {
    if (error) {
      console.error('Unable to close HTTP server', error);
      process.exitCode = 1;
    }
    // Close repository pools and other owned resources here using the existing lifecycle hooks.
  });
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
```

For a database-backed app, close the shared pool after the HTTP listener drains. Follow existing shutdown timeouts and resource cleanup.
Keep database configuration checks in the database module. Add startup probes or a dedicated environment schema when the application
needs them. Do not add an HTTP listener or HTTP auth middleware to background workers.

## Environment and Scripts

Commit `.env.example` with required keys and fictional values; gitignore local `.env.development` and any `.env.production`. Production
receives injected configuration. Use one environment-loading mechanism. If a project calls `process.loadEnvFile()` in an ESM entrypoint,
load the file before a dynamic import of modules that read the environment. Static imports evaluate before the entrypoint body.

```dotenv
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
COGNITO_USER_POOL_ID=us-east-1_EXAMPLE
COGNITO_APP_CLIENT_IDS=example-client-id
```

Use the existing runner when present. For a new standalone app, set `"type": "module"` in `package.json` and add these scripts.
`tsx` runs the source in watch mode. When using process settings or code defaults, omit the env-file flag. `tsc --noEmit` checks the
project, and the build emits JavaScript for Node to run.

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file=.env.development src/server.ts",
    "typecheck": "tsc --noEmit",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js"
  }
}
```

## TypeScript Configuration

Use the project's existing `tsconfig.json` when present. The ESM starter pairs Node's `"type": "module"` with `NodeNext` and targets
`ES2024` for Node.js 24. Use TypeScript 5.7 or later for this target and relative import rewriting.

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"],
    "rewriteRelativeImportExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmitOnError": true
  },
  "include": ["src"]
}
```

- `NodeNext` models Node's module and resolution rules. `target` sets the emitted JavaScript syntax baseline. Check Node API
  compatibility against the deployed runtime.
- `import { app } from './app.ts'` emits an import of `./app.js`. The rewrite covers eligible relative paths. Package imports,
  aliases, and extensionless paths need their own runtime resolution. Preserve `.js` specifiers or CommonJS in projects that already use them.
- `skipLibCheck` skips checking dependency declaration files while keeping strict checks on application code.
- With `verbatimModuleSyntax`, write `import type { RequestHandler } from 'express'` for a declaration used only as a type.
  Use `import express from 'express'` for the value called at runtime.
- `include` discovers the application files under `src`. `exclude` filters that discovery. An import can still pull in an excluded file.
  `rootDir` and `outDir` preserve the source layout in `dist`, so `src/server.ts` emits as `dist/server.js`.
- `types: ["node"]` loads Node's ambient types explicitly. TypeScript resolves Express and CORS types through their imports. Keep test
  globals in the test setup or a separate test config. Use `npx tsc --showConfig` and `npx tsc --noEmit --explainFiles` to diagnose
  unexpected compiler options and file inclusion.
- Use `tsc -p tsconfig.json` for the standalone build. In a repository with TypeScript project references, follow its build orchestration.
  `tsc -b` builds the referenced graph in dependency order. Since TypeScript 5.6 it can continue past errors in dependency projects.

Run the compiled entrypoint with Node and request `GET /heartbeat` using the target runtime and isolated configuration. Confirm a
200 response with `{"status":"ok"}`. The development command loads its env file before app imports execute. Production uses injected
configuration. For compiler details, see the [TSConfig reference](https://www.typescriptlang.org/tsconfig/),
[relative import rewriting](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-7.html#path-rewriting-for-relative-paths),
and [build mode behavior](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-6.html#allow---build-with-intermediate-errors).
