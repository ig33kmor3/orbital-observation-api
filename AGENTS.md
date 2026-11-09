# Express 5 REST API (TypeScript) — Agent Baseline

Rules for working in a layered Express 5 REST API written in TypeScript, backed by Postgres through Drizzle ORM and fronted by Cognito JWT
authorization. They apply to every file unless a more specific instruction in the task overrides them.

**Assumed majors:** Node 24, Express 5, TypeScript 7, Zod 4, Drizzle ORM 1. Only a few rules below depend on a major, and each says so where
it does. If the project is on a different major, the project wins — change this file rather than follow a rule that no longer applies.

## Project shape

`src/` holds the application, layered. Generated migrations live in the directory chosen by the migration configuration. Read the tree
before assuming other project directories.

The layers, and what each one is forbidden to do:

- `app.ts` — the bootstrap. Creates the app, mounts standard middleware, mounts routers, registers the 404 and error handlers, listens. No
  business logic.
- `routes/` — one router per resource. Declares paths and the middleware chain. No logic beyond wiring.
- `middlewares/` — reusable middleware: authorization, validation, 404, global error. Short-circuit by sending a response; otherwise call
  `next()`.
- `controllers/` — read the request, orchestrate repositories and services, shape the response. Never build a SQL query or call an AWS SDK
  client directly.
- `services/` — business logic and third-party integrations. One integration each, with an interface beside it. Throws domain errors; the
  controller decides the status.
- `data/repositories/` — owns every query. Wraps failures in a repository error. Knows nothing about HTTP.
- `data/db/schema/` — Drizzle table definitions, one file per table.
- `models/` — `entities/`, `dtos/`, `validation/`, `query/`, and `enums/`, with `utilities/mappers/` translating between those shapes.
- `dependencies/` — the composition root. Builds the database context and every third-party client once, at module scope. Never construct a
  `Pool`, a Drizzle instance, or an SDK client elsewhere; services take theirs through the constructor.

A layer may call downward, never upward. If a controller needs something from another controller, the logic belongs in a service.

## Toolchain

npm and ESM. Read `package.json` before running anything: script names, output paths, environment loading, and composed checks are project
configuration. Use the repository- defined scripts for development, build, test, lint, formatting, migrations, and containers. If one is
missing, report it rather than inventing an equivalent.

**Formatting is the configured formatter's job, not yours.** Read the project's formatter configuration and run its configured script. Never
infer settings from one file or restate them in prose.

Read the build and test TypeScript configurations to learn what is type-checked. A test transform does not necessarily replace a type-check;
report any uncovered test files.

## Environment configuration

Read the npm scripts, container definition, and deployment configuration to learn how each runtime receives environment variables. Do not
introduce a second loading mechanism.

- Every variable the runtime reads is documented in `.env.example`. Add a variable there in the same change that introduces the read.
- Never commit an environment file containing real values.

Avoid module-scope `process.env` reads. Import timing varies among development, tests, and containers, so an import can validate too early
or open a real connection. Read configuration inside a function or the composition root instead.

## Routes

One router per resource in `routes/<resource>.route.ts`, default-exported, mounted in `app.ts` under `/v1`.

- The router declares the **full resource path**, including parent segments: `/workspaces/:workspaceId/clients/:clientId`. The mount
  contributes only the version prefix.
- Register `app.use(express.json())` once in `app.ts` before the routers. Apply resource-specific body validation in the route chain.
- The middleware chain is ordered: authorization, then path parameters, then query or body, then the controller. Keep that order — a request
  that fails authorization must never reach a validation error message.
- Every route carries `authorize(...)` unless the endpoint is deliberately public. A new route with no authorization middleware is a
  finding, not a style choice.
- Each route gets a one-line doc comment naming the method and full path. Routers hold no logic — a route that needs a decision belongs in
  the controller.

## Validation

Zod schemas live in `models/validation/<resource>.validation.ts` and are applied by `validateParams`, `validateQuery`, and `validateBody`.

- Validate path parameters, query parameters, and body separately, with a schema each. Identifiers are `z.uuid()`; never accept a bare
  string where the column is a UUID.
- Assign the result of `safeParse()` to a named variable before checking its `success` flag.
- **Validation rejects; it does not transform.** The middleware does not write parsed output to `res.locals`, and controllers re-read the
  raw values from `req`. Do not introduce a `res.locals` pipeline for one endpoint — either the whole API moves or none of it does.
- Because parsing happens twice, a schema and the mapper that re-reads its value must change in the same edit. A schema capping `limit` at
  100 while the mapper accepts more is a defect no type check will catch.
- Export the inferred type beside each schema and use it for the controller's cast. Import application schemas from `zod`; middleware that
  needs shared internal types imports them from `zod/v4/core`. Do not import ordinary schema builders from `zod/v4`.

## Controllers

One controller module per resource. Handlers are exported `const` arrow functions typed `RequestHandler`: `queryXHandler`,
`getByIdXHandler`, `saveXHandler`, `updateByIdXHandler`, `deleteXHandler`.

- Read route parameters and body at the top, before the `try`. Orchestrate inside it.
- Every handler ends with `next(error)` for anything it did not expect. Catch only the error types you can map to a specific status.
- Return after sending a response. A handler that sends and falls through will try to send twice.
- Controllers call `context.<resource>` and services. They never import a Drizzle table, build a `where` clause, or construct an SDK
  client, and they map between wire shape and entity through the resource's mapper class, never inline.
- Existence is checked before mutation: load the record, return 404 when it is missing, then act.

Status codes, and what they mean here:

- `200` with the mapped DTO for a read; `201` with the created DTO and a `Location` header naming the new resource.
- `204` with an empty body for a successful update or delete.
- `409` for a unique-constraint violation, mapped from the Postgres error code. The `400` and `404` cases are in Tenant scoping.

## Tenant scoping

Every workspace-scoped resource is addressed as `/workspaces/:workspaceId/<resource>/:id`, and the two identifiers are independent user
input. The route proves neither.

- After loading a record by its own id, **verify it belongs to the workspace in the path** before returning or mutating it. Skipping this
  check exposes every record in the table to any authenticated caller who can guess an id.
- Do the check on reads, updates, and deletes alike. A delete that skips it is worse than a read that does.
- On a mismatch, respond `400` with a validation error, matching the existing handlers. Do not respond `404` on some routes and `400` on
  others.
- On create, load the parent workspace first and return `404` when it does not exist. Then set the workspace id on the entity from the
  **path**, never from the request body.
- On update, reject when the path id and the body id disagree before touching the database.

`authorize(allowedGroups)` verifies the access token and requires group membership. It establishes *who* the caller is, never *which
workspace* they may touch — the checks above are the only thing standing between two tenants.

## Errors and responses

Error responses share one shape: `{ type, status, message }`, plus `details` when there is structured context. `type` comes from the
`ErrorType` enum, `status` from the `StatusCode` constants.

- Never write a numeric status literal or invent a `type` string. Use `StatusCode.NOT_FOUND`, and add an `ErrorType` member for a genuinely
  new category.
- Repository errors are not HTTP errors. `NotFoundError` is a repository sentinel that a controller translates into a 404; it carries no
  status of its own.
- The global error handler returns a generic message and logs the real one. **Never change it to return the caught error's message** — that
  leaks table names, query fragments, and stack detail to the caller.
- The global handler must keep all four parameters `(err, req, res, next)`. Drop one and Express silently treats it as ordinary middleware.
- The 404 handler is mounted after all routers and before the error handler. Order is behavior, not preference.

Express 5 forwards rejected promises from async handlers automatically. The explicit `try`/`catch` in controllers maps known error types; it
is not there to catch escapes.

## Data access

One repository class per resource in `data/repositories/`, implementing `IRepository<TEntity, TFilter>`, taking the shared `Db` in its
constructor, and registered on `DatabaseContext`.

- **Drizzle types never leave the repository.** Every method returns a domain entity or a `Pagination<T>` of them, produced by a private
  `map<Resource>Record` method. A controller that sees a column name is a layering break.
- Column names and entity field names differ on purpose (`email` → `emailAddress`, `updated_at` → `modifiedAt`). The mapping method is the
  single place that knows both.
- `update` throws `NotFoundError` when the write matches no row — check the length of the `returning(...)` result. `remove` is idempotent
  and returns silently.
- `create` inserts, then re-reads through `findById` so the caller gets server-generated defaults. Wrap constraint violations in the
  repository's error types rather than letting a raw driver error reach a controller; Postgres codes live in `DatabaseErrorCode`.
- Writes that must not partially apply run in a transaction; sequential awaits are not one.
- Schema changes go through the repository's configured migration generator and land in its configured migration directory. Never hand-edit
  a generated migration, and never change a schema file without generating the migration in the same change.

Pagination is offset-based, one model for the whole API. Never add a cursor, an encoded token, or a `nextToken` field to an endpoint
alongside it.

- Run the page query and the count query together with `Promise.all`, then compute `totalPages` and `hasNextPage`. Do not fetch one extra
  row to infer a next page.
- **Order by a deterministic key set ending in the primary key.** Sorting on a non-unique column alone lets rows repeat or vanish across
  pages.
- `limit` has a maximum, and the controller shapes the envelope through `toPaginated`. Never remove the cap to satisfy a caller who wants
  every row.

## Prefer boring code

When several implementations work, choose the one a mid-level developer understands on the first read. Cleverness is a cost paid by every future reader.

- Prefer plain control flow — `if`, `for`, early returns — over deeply chained pipelines or condensed one-liners. Favor code that can be stepped through in a debugger.
- Follow the patterns already in the repository. Do not introduce a second architectural style alongside a working one.
- Some duplication is acceptable when it keeps logic readable and local. Do not abstract on the second occurrence; wait for the third.
- Build only what the current task requires. Never generalize for a hypothetical future caller.
- Do not introduce factories, builders, dependency-injection layers, or similar patterns unless the problem clearly demands one.
- Do not add a dependency for something the standard library already does.
- Added complexity is fine when it buys correctness, performance, or maintainability — but comment why it was worth the cost.

## Strict typing

`strict: true` is assumed. Code that only compiles with it off does not ship.

- Never use `any`. When a type is genuinely unknown, use `unknown` and narrow it explicitly.
- Never use `as` to silence an error. A cast is a claim you cannot prove; fix the type instead. The only acceptable casts are on parsed external input immediately after validation.
- Never use non-null assertions (`!`). Narrow with a check, or make the type honest about nullability.
- No `@ts-ignore`. `@ts-expect-error` is permitted only with a comment naming the upstream issue it works around.
- Type the boundaries, infer the interior. Annotate exported signatures explicitly; let inference handle local variables.
- Prefer discriminated unions over optional-field soup. Make illegal states unrepresentable rather than checking for them.
- Prefer named domain types over catch-all maps. Reserve `Record<string, unknown>` for genuinely untyped external payloads — never for config objects, query-expression maps, or any structure whose keys you know or can partially enumerate.
- Validate all external input (network, filesystem, env, user) at the boundary with a schema, and type the interior from the schema's output.

One stack-specific note: route parameters are typed `string` after a cast, because validation rejects without narrowing. That cast is
sanctioned — it sits immediately after a Zod schema that already proved the shape. Casts anywhere else are not.

## Vertical code layout

Write code that reads top to bottom like prose. Density is not concision.

- One statement per line. Never chain unrelated operations onto one line to save space.
- Separate logical stanzas with a single blank line. Group a variable's declaration with the lines that first use it.
- Declare variables close to first use, not in a block at the top of the function.
- Put the early returns and guard clauses first, then the main path. Never wrap the main path in an `else`.
- Order functions so a caller appears above the functions it calls, so the file reads at descending levels of detail.
- Break a long expression across lines at the operators, aligning the operands — do not let it wrap arbitrarily at the margin.
- Keep functions short enough to see whole. If you cannot see the top and bottom at once, extract a named helper.

## Naming

- Names state what a thing is or does, not how it is implemented. `activeUsers`, not `filteredArray`.
- No abbreviations except ones universal in the domain (`id`, `url`, `db`). Never invent one to save characters.
- Booleans read as assertions: `isReady`, `hasAccess`, `shouldRetry`. Never negated in the name — `isDisabled` over `isNotEnabled`.
- Functions that do something are verb phrases; functions that return something are noun phrases or `getX`. Do not mix both roles in one function.
- The length of a name scales with the size of its scope. A loop index may be `i`; a module-level export may not.
- Name files for their role in the layer they sit in: `client.handler.ts`, `clients.controller.ts`, `client.repository.ts`, `client.validation.ts`. A test file takes the name of the unit under test plus the suffix the project uses.
- Match the surrounding file's existing vocabulary. If the codebase says `account`, do not introduce `user` for the same concept.

For this stack:

- Handlers are `<verb>[By<Key>]<Resource>Handler`: `queryClientHandler`, `getByIdClientHandler`, `saveClientHandler`,
  `updateByIdClientHandler`, `deleteClientHandler`. A new operation follows the same pattern.
- The layer suffixes here are `.route.ts`, `.controller.ts`, `.repository.ts`, `.validation.ts`, `.mapper.ts`, `.model.ts`, and
  `.schema.ts`. Collections are plural at the route, controller, and table; the entity, repository, and mapper are singular. Follow the
  existing split rather than normalizing it.
- Use `type` aliases for model shapes. Give them descriptive PascalCase names without an `I` prefix, such as `Observation`,
  `ObservationDto`, and `SaveObservationInput`.

## Comments

Use the workflow signposts in `src/app.ts` and `src/server.ts` as the style reference. Use JSDoc for contracts and short inline comments
to guide readers through meaningful steps. Explain the intent, constraint, or ordering when it helps the reader follow the code.

- Use concise doc comments to explain a function's purpose and contract. Include
  the HTTP method and route for handlers or controllers where applicable.
- Format every JSDoc block across multiple lines, even when it contains one sentence. Put `/**` and `*/` on their own lines and prefix
  each content line with ` *`. Use `//` for inline workflow signposts.
- Put each signpost above the group of statements it explains. A signpost can name a workflow stage, such as preparing validated input
  or protecting a public response, when it helps a reader scan the function.
- Explain workarounds, non-obvious constraints, ordering requirements, and
  deliberate deviations from the normal pattern.
- Skip comments that paraphrase a single obvious statement or repeat the function's JSDoc. Keep signposts and rationale current as behavior
  changes.
- Never leave commented-out code. Version control already remembers it.
- No changelog comments, no attribution comments, no `// TODO` without a concrete
  next action or removal condition.
- Follow explicit project or user documentation preferences; otherwise match the
  closest existing peer in the same layer. Keep coverage uniform within a peer group.
- Document exported contracts: purpose, relevant inputs and outputs, assumptions,
  and meaningful errors. Use the language's documentation style without forcing
  redundant tags or narrating every statement.

The peer groups here are the layer directories, and the floor in each is a JSDoc block on every exported symbol — handler, middleware,
factory, public repository method, table.

- Controllers additionally carry the method and full route in the block, plus short signposts for meaningful workflow steps. Repositories carry
  `@param`, `@returns`, and `@throws`.
- Inline comments also explain stages such as hydration, pagination, uniqueness locks, and transactional writes when they help a human
  follow the workflow.

## Testing

Every behavior change ships with a test that covers it. Tests follow the project's established layout and are named for the unit under test.

- One behavior per test. The test name states the behavior in a sentence: `returns empty list when no matches`, not `search 2`.
- Write tests before or after the implementation, whichever suits the work. Ordering is not the point; covering the changed behavior before reporting done is.
- Confirm every new test can actually fail. A test written against already-passing code may be asserting nothing — revert the change, watch it go red, restore it.
- For a bug fix, that check is mandatory: a test that has never failed cannot prove it covers the reported bug.
- Assert on observable behavior, not on internal calls. A test that breaks on a refactor with no behavior change is a bad test.
- Cover the boundaries: empty, one, many, and the error path. The happy path alone is not coverage.
- Keep tests deterministic. Stub time, randomness, and external side effects rather than tolerating a flaky assertion.
- Never weaken an assertion or delete a test to make a suite green. If a test is wrong, say so explicitly and explain why before changing it.
- Never report work as done on an unrun suite. If tests cannot be run, say that plainly rather than implying they passed.

Mock at external boundaries and deliberate architectural seams, nowhere else.

- Mock what you do not own: network calls, clocks, randomness, the filesystem, and third-party services. Mock an internal collaborator only through an intentional seam such as an injected repository or composition root.
- Never mock the thing under test or an internal implementation detail merely to make a test easier to write. That couples the test to the implementation and it will pass while the code is broken.
- Prefer a real in-memory implementation (an actual sqlite, a fake repository) over a mock with scripted return values.
- If a test needs more than a couple of mocks to run, the design is telling you the unit has too many dependencies. Fix the design instead of adding mocks.
- Never assert that a mock was called as the primary assertion. Assert on the resulting state or output.

For this stack specifically:

- Use the project's configured test runner and established test layout.
- Test controllers through the established public boundary. When calling a handler directly, construct only the request, response, and
  `next` behavior the test exercises.
- Mock at `dependencies/app.dependencies` and at third-party SDK modules — the same boundary the composition root defines. Never mock a
  repository's internals or a mapper. Cover the authorization and tenant-scoping rejections through that boundary; a missing cross-workspace
  test is how that check gets deleted later.
- Follow the configured runner's module-mocking and ESM rules; do not copy hoisting or specifier conventions from another project.

## Verification

Run the project's checks before reporting a change complete. Never describe work as done on checks you did not run.

- The default gauntlet is typecheck, lint, test, build. Run all of it after any change to runtime code.
- Scale the checks to the work. A documentation-only or comment-only change does not need the full suite — say which checks you skipped and why.
- Run the checks the repository actually defines. If a script is missing, say so rather than substituting an equivalent command.
- Fix what the checks report before moving on. Never leave a failing check for the reviewer to find.
- If a check cannot run in this environment, name it and say so plainly. Do not imply it passed.
- Report the outcome, not the intent: name the commands you ran and what they returned.

## Version control

Format: `type(scope): summary` — `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`.

- Summary in the imperative mood, lower case, no trailing period, under ~70 characters. "add retry to fetch client", not "Added retries."
- The summary says what changed. The body, when present, says why — the problem, the constraint, the alternative rejected. Never restate the diff in prose.
- One logical change per commit. If the summary needs "and", split the commit.
- Never mix a refactor with a behavior change in one commit. They need different review attention.
- Reference the issue in the body, not the summary.

- Never commit directly to the default branch. Branch first, always.
- Branch names: `type/short-description` in kebab-case — `fix/token-refresh-race`.
- Commit and push only when explicitly asked. Finishing a change is not permission to commit it.
- Never amend, rebase, force-push, or reset a branch that has been pushed, unless explicitly told to.
- Never use `git checkout .`, `git reset --hard`, or `git clean` to discard work you did not create. Uncommitted changes in the tree may be the user's.
- Never commit generated artifacts, dependency directories, or anything matched by the ignore file. Never commit a credential, even to a private repo.

## Boundaries

Stop and ask before any action that is hard to reverse. Approval for one action is not approval for the next.

Requires asking first:
- Deleting or overwriting files you did not create in this session.
- Any database migration, schema change, or write against a non-local database.
- `rm -rf`, history rewrites, force pushes, or dropping a branch.
- Installing, upgrading, or removing dependencies.
- Anything that touches CI configuration, deployment, or infrastructure.
- Anything that sends data outward: opening a PR, posting to an API, sending a message.

Before overwriting or deleting anything, read it first. Describe what will change and wait for a clear yes. If the answer is ambiguous, it is a no.

This API owns a real database and real AWS resources. Ask before:

- Running any migration, seed, or script that writes to a database you did not create for this task.
- Editing or deleting a generated migration. Generated migrations are history; a migration that has been applied is never rewritten.
- Anything that touches deployment or CI: an IAM policy or role, a workflow in `.github/workflows/`, the `Dockerfile`, or `compose.yaml`.
- Adding, upgrading, or removing a dependency — a pinned prerelease ORM build is a migration, not an upgrade — or any real call to SES, S3,
  or Bedrock outside a test.

- Never read `.env` files, credential stores, key material, or CI secrets unless the task cannot be done otherwise and the user has asked for it.
- Never print a secret's value — not in output, not in logs, not in a comment, not in an error message. Refer to it by name.
- Never paste a secret, token, internal hostname, or customer data into an external service, a commit, an issue, or a PR description.
- Never write a credential into source. Read it from the environment at runtime, and add a placeholder to the example env file instead.
- If you encounter a committed secret, stop and report it. Do not quote the value in the report.

## README Consistency Standard

Give readers a concise, familiar entry point. Standardize organization, not content,
tooling, or architecture; preserve useful repository-specific information.

### Recommended section order

Use these names and this order where applicable; omit irrelevant sections.

1. **Purpose** — Briefly explain what the repository does, who uses it, and its
   responsibility within the broader application.
2. **Architecture / Repository Overview** — Describe major components and connections;
   for docs repositories, describe organization and sources of truth. Include a small
   diagram only when it clarifies a relationship; accuracy matters more than format.
3. **Prerequisites and Configuration** — Identify tools, external resources, and required
   values before commands that need them. Separate local and deployment requirements;
   explain value sources, generated values, and public exposure. Never include secrets.
4. **Local Setup and Usage** — Give complete, ordered steps using actual package scripts,
   including tests/checks. For docs repositories, explain navigation, editing, preview,
   and validation instead of inventing application workflows.
5. **Deployment / Publishing** — Where applicable, separate Development and Production,
   first-time preparation and routine releases. Explain triggers, configuration,
   migration ordering, and publishing risks; link detailed runbooks.
6. **Teardown / Cleanup** — Show supported commands and exact targets where applicable.
   State what is deleted, retained, imported, or needs separate cleanup. Never imply
   stack destruction removes every related resource.
7. **Operational Notes and Limitations** — Include troubleshooting, compatibility, and
   deferred capabilities. Distinguish implemented behavior, known limitations, and
   checks or deployment behavior not yet verified.
8. **References** — Link useful specs, testing guides, contracts, and runbooks. Reuse
   existing indexes rather than adding exhaustive document catalogs.

### Content and editing rules

- Review the existing README and current source before reorganizing. Preserve important
  information; remove only duplication, obsolete guidance, or inaccuracies. When moving
  detail to a runbook, retain a short explanation and a working README link.
- Preserve API endpoints, authentication, configuration, database deployment,
  workers/retries, test prerequisites, and migration safety when applicable.
- Preserve UI routes, authentication/loading, environment variables, build labels,
  API connection requirements, and deployment details when applicable.
- Preserve docs requirements, prototypes, company standards, ownership, navigation,
  editing, and validation conventions. Put route/endpoint references near the overview
  or in a clearly named section nearby; do not force awkward placement.
- Keep commands copyable, correctly scoped, and consistent with scripts and pipelines.
  Do not impose another repository's framework, runner, environments, or architecture.
- Avoid completed-cycle handoffs, repeated spec narratives, and speculative features
  presented as current behavior. README refresh work does not authorize runtime code,
  infrastructure, dependency, or deployment changes.

### Verification

Verify commands, routes, configuration, links, and operational claims against current
source. Run applicable Markdown formatting and whitespace checks. Report unverified
statements plainly; local tests alone do not establish production readiness.

## Reporting

Report outcomes faithfully. If tests fail, say so and show the output. If you skipped a step, say which. If something is done and verified,
say so plainly without hedging. Never describe work as complete when part of it is unfinished — say what is left and why.
