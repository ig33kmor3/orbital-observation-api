---
name: stack-expressjs-rest-api
description: Design and implement Express 5 REST APIs with TypeScript, following existing project patterns. Use for routes, controllers, middleware, validation, authentication, services, repositories, runtime composition, RFC 9457 Problem Details and safe error handling, and optional Lambda Web Functions deployment.
---

## Purpose

Deliver working Express API changes using this order of precedence:

1. explicit user requirements
2. existing project architecture, naming, API contracts, and module settings
3. this skill's examples

Keep examples and generated code simple: arrow functions, plain `RequestHandler` declarations, named DTOs on local variables, clear control
flow, and small classes. Follow the project's module and import conventions. Avoid positional handler
generics, endpoint-specific request types, speculative abstractions, and unrelated restructuring. Prefer descriptive PascalCase type aliases
for model shapes. Use multiline JSDoc for exported contracts, including single-sentence blocks. Separate logical groups with blank lines
and add inline signposts when they explain meaningful steps.

## Error Contracts

Inspect existing helpers, middleware, callers, and tests before changing error responses. For new contracts, prefer RFC 9457 Problem
Details. Preserve established envelopes, status codes, reasons, type URIs, validation keys, authentication headers, CORS, and success
responses; adopting Problem Details for an existing API is an explicit contract migration. Reuse native support or existing helpers;
avoid a parallel error framework, registry, or unnecessary classes.

Trace malformed/missing input, body/query/path validation, expected domain failures, authentication/authorization, and unexpected failures
through their owning layers. Use safe public messages and stable application identifiers. Preserve intentional not-found responses that
hide unauthorized resources. Keep transport mapping out of services/repositories where those boundaries already exist.

## Repository Discovery

Read the project's scripts, compiler settings, tests, and the app, route, and dependency wiring relevant to the change. Follow local
conventions. Use the closest reference when a pattern is missing.

## Implementation

1. Identify method, path, inputs, authorization, success/error responses, and required dependency access. Resolve material contract gaps
   before affected work; preserve established status codes, headers, payloads, and pagination.
2. Extend the existing router and app mount. For a new standalone API, export the Express app and each router directly. Mount
   `app.use(express.json())` once before the routers that consume JSON. Keep prefixes consistent so `/v1` plus `/items` produces
   `/v1/items` exactly once.
3. Validate body, path, and query before the controller. Assign `safeParse()` to a named variable before checking `success`.
   With rejection-only validation, handlers read the validated request values. When a handler needs Zod's transformations, coercions,
   or defaults, use the project's parsed-output pipeline. For a new pipeline, use `response.locals.validated`. Keep the handoff consistent
   for each input target and match the types to the values the handler reads.
4. Authenticate protected routes and enforce groups/scopes and ownership where required. Use one shared `Request` extension for middleware-
   added identity; keep its fields optional until checked. Controllers that do not use identity keep ordinary handler declarations.
5. Keep orchestration in controllers, domain workflows/integrations in services, and datastore requests, transactions, mapping, and cursor
   handling in repositories. Reuse the project's dependency wiring. In new apps, use `dependencies/app.dependencies.ts` to assemble
   the shared repository context and any services. For Drizzle, define `export type Db = typeof db` beside the configured client and
   use it in repository and context constructors. A simple CRUD controller can map its input to an entity and call the repository
   through `context`.
6. Reuse error/status utilities. For new patterns, let global error middleware translate typed errors; retain established local `try/catch`
   mappings. Keep parsing, validation, authentication, authorization, and unexpected failures consistent without exposing internal details.
7. Load configuration before dependency initialization. Let `app.ts` wire Express, `server.ts` own listening and shutdown, and the
   database module own its connection settings and client. App imports can require dependency settings. Add startup probes and
   environment schemas when a project requirement calls for them. Preserve the existing entrypoint and configuration conventions.

## Express 5 Baseline

- Rejected async handlers reach error middleware. Pass callback-based failures to `next(error)`.
- Keep four error-handler parameters and delegate when headers have already been sent.
- Keep the project's module format and dependency versions. For a new standalone starter, use the [app pattern](references/app-pattern.md)
  for dependencies, layout, ESM configuration, and startup commands.

## References

Load the references relevant to the change.

- [app-pattern.md](references/app-pattern.md): middleware selection, app composition, ESM build configuration, startup, and environment loading.
- [route-pattern.md](references/route-pattern.md): router paths, authorization, validation, and mounts.
- [controller-pattern.md](references/controller-pattern.md): CRUD handlers, local error mapping, and shared request identity.
- [middleware-pattern.md](references/middleware-pattern.md): authentication, rejection-only and parsed validation, and global errors.
- [model-pattern.md](references/model-pattern.md): entities, DTOs, and schemas.
- [error-pattern.md](references/error-pattern.md): shared errors and a minimal Problem Details response function.
- [problem-details.md](references/problem-details.md): RFC members, optional extensions, validation mapping, and safety boundaries.
- [status-code-pattern.md](references/status-code-pattern.md): HTTP status constants.
- [pagination-pattern.md](references/pagination-pattern.md): pagination contracts and validated cursors.
- [repository-pattern.md](references/repository-pattern.md): concrete repository classes and shared context/composition.
- [testing-pattern.md](references/testing-pattern.md): isolated HTTP, middleware, and persistence tests.
- [storage-cleanup-pattern.md](references/storage-cleanup-pattern.md): recoverable cross-system deletion when uploads/exports need it.
- [lambda-web-functions.md](references/lambda-web-functions.md): optional deployment without containers.
- [api-review.md](references/api-review.md): completion checklist.

## Validate and Deliver

Use the applicable checks in [api-review.md](references/api-review.md). Run the project's relevant tests, type checks, and build. Verify
changed HTTP behavior through real middleware. Report what passed and any relevant checks you could not run.

If the task uses `stack-spec-workflow`, record progress and evidence in its active Delivery Plan.
