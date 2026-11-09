# Lambda Web Functions

Use when the user selects Lambda Web Functions as an Express deployment option. Keep the application's routers, middleware, controllers,
services, repositories, and composition. This platform runs the HTTP server from a ZIP package; it does not require an event-to-HTTP adapter
or container. Preserve an existing deployment unless a change is requested. See the [AWS overview](https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html).

## Discover Before Wiring

Check the target Region, supported runtime, installed `aws lambda-web` commands, build/module settings, production dependencies, endpoint
auth, and database connectivity. Verify available IaC resources before using them; do not assume a classic Lambda or Storm construct
supports Web Functions. The CLI example below is an alternative when the project has no established deployment mechanism.

## HTTP Server Startup

Adapt the existing process entrypoint. This example follows the ESM starter's relative `.ts` import convention. Load local env files
through the development command in [app-pattern.md](app-pattern.md). Hosted configuration is injected.

```ts
// src/server.ts
import { app } from './app.ts';

const address = process.env.AWS_LAMBDA_HTTP_ENDPOINT || `127.0.0.1:${process.env.PORT || 3000}`;
const [host, port] = address.split(':');

const server = app.listen(Number(port), host, (error?: Error) => {
  if (error) {
    console.error('Unable to start HTTP server', error);
    process.exitCode = 1;
    return;
  }
  console.log(`Server listening on ${host}:${port}`);
});

const shutdown = (): void => {
  server.close((error) => {
    if (error) process.exitCode = 1;
    // Close owned clients through existing lifecycle hooks; keep cleanup bounded.
  });
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
```

Keep the existing compiler/module system. Native compiled ESM requires resolvable file extensions throughout its import graph; adapt only
when that is the project's existing build. Lambda does not require an ESM migration.

Bind exactly the host and port supplied by Lambda; `PORT` alone is insufficient. Start listening within 10 seconds. The runtime currently
supports Node.js 24 and loads root `index.js` unless `AWS_LAMBDA_NODEJS_ENTRYPOINT` selects another file; it does not use `package.json`'s
entrypoint by itself. Check current [runtime requirements](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-runtimes.html).

## Package the Compiled Application

For a standalone npm project using its selected build, stage only compiled code, production dependencies, package metadata, and
required runtime assets. Run this on a compatible Linux Arm64 build environment when native modules are present; a macOS build is not a
native-module compatibility check. Adapt workspace dependencies and lifecycle scripts to the existing build pipeline.

```bash
npm ci
npm run typecheck
npm run build

web_package_dir="$(mktemp -d)"
cp package.json package-lock.json "$web_package_dir/"
cp -R dist "$web_package_dir/dist"
(cd "$web_package_dir" && npm ci --omit=dev)
```

Copy required templates/static assets explicitly; keep their paths relative to the packaged code. Confirm `dist/server.js`, its imports,
production modules, and matching module settings are present. Exclude env files, credentials, tests, and development artifacts. Test the
staged server and inspect its archive before deployment. Keep the package within current
[S3 package requirements](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-code-s3.html).

## Deployment Example

These commands mutate AWS resources; run only for an authorized deployment. Use a CLI release that includes `aws lambda-web deploy` and
inspect its help first. Keep the staging variable from the preceding block in the same shell. Supply the actual Region, versioned deployment
bucket with the required Lambda read policy, and execution role with logging and application permissions.

This example creates or updates a **development** HomeRegion endpoint with automatic rollout. `ApplicationManaged` leaves all caller
authentication to Express. Configure the application's actual public configuration and secret-store references before using protected routes.

```bash
aws lambda-web deploy \
  --name example-express-api \
  --code "$web_package_dir" \
  --bucket-name example-versioned-code-bucket \
  --execution-role-arn arn:aws:iam::111122223333:role/example-express-api \
  --runtime nodejs24.x \
  --env NODE_ENV=production \
  --env AWS_LAMBDA_NODEJS_ENTRYPOINT=dist/server.js \
  --endpoint-name dev \
  --endpoint-type HomeRegion \
  --auth-type ApplicationManaged \
  --auto-deployment-mode LatestRevision \
  --region us-east-1 \
  --create
```

The deploy command uploads the staged code; the explicit env setting selects its compiled entry. Do not also pass `--entry-point`, which
generates a wrapper instead. See
[creation and deployment](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-create.html).

For production, use the existing release process with explicit revision weights (`Disabled` auto-deployment), health checks, and rollback.
Record the code object's version and retain artifacts needed by active/rollback revisions. With direct revision API calls, send the complete
desired service configuration and environment map: omitted settings are not inherited. Retrieve secrets at runtime rather than packaging
them or copying local env files. See [environment configuration](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-revisions-env-vars.html)
and [deployment patterns](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-deployment.html).

## Application and Platform Boundaries

- Keep request identity and mutable request data in request scope. Multiple requests share a process; reuse bounded clients/pools, handle
  stale connections, and persist required state externally. Set concurrency, environment, and rate limits from measured downstream capacity.
- Handle `SIGTERM` cleanup within one second; completion is best effort. Keep required jobs in durable workers rather than timers or work
  that continues after sending the response. See the [execution lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-env-lifecycle.html).
- Preserve Express authentication, authorization, body limits, CORS, and preflight behavior. `IamAuth` authenticates signed AWS callers; it
  does not establish application groups or record ownership. Check bearer-header forwarding for the chosen front door/auth combination.
- Custom domains/WAF need a front door such as CloudFront. Restrict origin access to prevent bypass. Trust only verified proxy hops; do not
  use caller-controlled forwarded hosts for redirects or authorization. Private VPC access needs an egress connector, currently limited to
  HomeRegion endpoints. WebSocket upgrades are unsupported; assess SSE for one-way streaming. See
  [networking](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-networking.html) and
  [HTTP headers](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-http.html).
- Compare measured request, active-CPU, memory-lifetime, and data-transfer costs with the existing hosting option. Memory is billed while an
  environment exists, including idle time; scaling to zero also introduces cold-start considerations. See the
  [service overview](https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html).

## Validate and Hand Off

Locally type-check/build and exercise startup with and without a supplied Lambda address. Test the staged package's health route, a
protected route, rejection paths, and relevant concurrency/cleanup behavior using isolated dependencies. Verify no developer env file is
needed in the hosted path. Follow [testing-pattern.md](testing-pattern.md) for isolation.

After an authorized deployment, verify the actual endpoint, application auth, CORS/preflight, logs, downstream connectivity, and intended
revision routing. `Active` alone does not prove the server started correctly. Check front-door bypass protection when configured; test SSE
disconnects/timeouts when used. Follow the project's rollback criteria and report unrun cloud checks as unverified.

Summarize the entrypoint, artifact, auth/network choices, validation evidence, and remaining limitations in the existing delivery plan and
handoff.
