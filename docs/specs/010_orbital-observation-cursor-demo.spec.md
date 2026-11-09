# Orbital Observation API — Cursor Demo Spec

## Current Status

- Requirements **Locked**
- Delivery **Phase 3 complete**
- Active phase **None**
- Next step **Use the calibrated workload for the live Cursor investigation.**

## Overview

Role-play a Cursor trial with a US Space Force–inspired space domain awareness engineering team. Its technical pilot group already uses
GitHub Copilot and wants to evaluate how an engineer investigates a silent data-integrity incident. The customer and workload are
representative, and all observations, identifiers, and logs used in the demo are synthetic.

## Scope / Non-Scope

### In Scope

- One local Express 5 API using the existing Node.js 24, TypeScript 7, Zod, and `/v1` conventions. Add real PostgreSQL persistence through
  Drizzle ORM, with PostgreSQL running locally under Docker Compose.
- One seeded demo baseline that can exhibit a silent regression in the latest observation under concurrent ingestion, one standalone HTTP
  reproduction script, and one live diagnosis and repair in **Cursor Debug Mode**. Preparation may use other tools.
- Multi-replica behavior is a correctness constraint for the repair and a discussion topic.

### Out of Scope

- Production deployment, authentication, real mission systems, a frontend, a worker fleet, and Kubernetes.
- Implementing a second scenario. If concurrency misses the reproduction target, reconsider ground-station scheduling as a separate scope
  decision.

## Requirements

- **R1 — Ingest observations.** `POST /v1/observations` accepts a JSON observation with a unique `observationId`, an `objectId` identifying
  the satellite, and an `observedAt` timestamp with an explicit offset. Validate the payload, compare timestamps by instant, and acknowledge
  creation with HTTP 201, the created observation, and a `Location` identifying it only after the observation commits. Invalid input returns
  HTTP 400. A duplicate observation ID returns HTTP 409 and leaves stored state intact.
- **R2 — Read the latest observation.** `GET /v1/objects/:objectId/latest` returns HTTP 200 and the latest observation for that object, or
  HTTP 404 when none exists. Preserve the public `GET /v1/heartbeat` contract. The intended invariant is that each object's latest
  observation has the greatest committed `observedAt` instant. Once selected, a latest observation remains selected when another event has
  the same instant. Older observations may still be accepted.
- **R3 — Prepare a realistic incident.** In the pre-fix baseline, real overlapping requests through the ordinary API can all succeed while a
  subsequent read returns an older observation as latest. Use ordinary application and database execution. Keep forced scheduling,
  artificial delays, debug endpoints, and permanent demo-only instrumentation out of the API. Provide repeatable setup and cleanup for an
  isolated local demo dataset.
- **R4 — Reproduce through HTTP.** Expose `npm run demo:reproduce` as a standalone client that uses only the public HTTP contract. Make
  observations per round, maximum in-flight requests, object count, round count, and submission seed configurable. Concentrate mixed
  timestamp orders on a small set of synthetic objects. After all requests settle, compare each latest response with the maximum timestamp
  from confirmed committed submissions and any known starting observation for that object. Each round must use isolated data or start from a
  known baseline. Report the profile and seed, elapsed time, response counts, and expected versus actual values for mismatches. A confirmed
  regression exits nonzero. Report transport or HTTP failures separately and classify ambiguous commits, such as timeouts, as inconclusive
  for affected objects. A clean round requires successful requests and verification for every object. Keep diagnosis and repair details out
  of the workload and its output.
- **R5 — Diagnose and repair live.** Open the repository in Cursor and describe the symptom and reproduction command. Use Debug Mode to form
  competing hypotheses, add temporary instrumentation, rerun the workload, and use correlated runtime evidence to explain which operations
  produced the regression. Review the evidence before applying a targeted repair. The repair must preserve the latest-state invariant across
  independent API processes sharing PostgreSQL. Verify with the same workload and a focused real-PostgreSQL regression test. Review the
  final diff and remove temporary diagnostics.
- **R6 — Prepare and run the interview.** Prepare a 30-minute role-play for two Field Engineers, with about 5 minutes of customer and trial
  framing, 20 minutes for one live workflow in Cursor, and 5 minutes for discussion, with technical Q&A throughout. Frame the pilot around
  time to a verified diagnosis, engineer effort, and evidence quality. Be ready to discuss model, context, memory and tool choices, compare
  the workflow with GitHub Copilot and Claude Code, and address security and compliance questions without assuming customer approval.
  Prepare assumptions, a view on Field Engineering and AI's effect on engineering teams, and questions for the panel. Confirm Cursor
  sign-in, available usage, and screen sharing before the interview.
- **R7 — Separate preparation from the live workspace.** Open a clean, runnable pre-fix snapshot and a fresh Cursor chat for the live
  investigation. Keep this spec, interview materials, preparation notes, and any prepared repair out of the snapshot and any Git history
  available from it. Give Cursor the observed symptom and the reproduction command.

## Acceptance Criteria

- **R1–R2:** Real HTTP tests against a disposable PostgreSQL database cover creation, duplicate ID, invalid input, missing object, late
  arrival, equal instants, and object isolation. The heartbeat still returns HTTP 200 with `{"status":"ok"}`.
- **R3–R4:** On the demo machine, the selected profile reproduces a confirmed regression with all ingestion requests successful in at least
  9 of 10 independent runs from clean demo data. Record the profile, seed, and outcomes. Validate an alternate workload profile to use if
  the first run is clean.
- **R5:** Cursor captures runtime evidence that distinguishes the actual failure mechanism from plausible alternatives. After the repair,
  repeated runs of the same HTTP profile are clean. The focused integration test fails against the vulnerable baseline and passes after the
  repair, and the final diff leaves the workload's acceptance logic intact.
- **R6:** Prepare the interview framing and Q&A, and confirm Cursor sign-in, available usage, and screen sharing before the interview.
- **R7:** Inspect the exact snapshot and any accessible Git history before the live demo. Confirm the workload runs from that snapshot, and
  use a fresh Cursor chat with the symptom and command as its initial context.

## What This Touches

- API routes, validation, controller and service behavior, and repository-owned persistence.
- Local PostgreSQL configuration, migrations, isolated demo fixtures, and setup instructions.
- Standalone workload and API and database integration tests.

## References

- [Cursor Demo Interview guidance](../GUIDANCE.pdf)
- [SpaceXSI FE Demo](chatgpt-conversation://6aee2735-5340-83ea-b15c-d49481369234)
- [Branch · SpaceXSI FE Demo](chatgpt-conversation://6aee791c-266c-83e8-8cd3-bd978faaa600)
- [Cursor Debug Mode documentation](https://prod.cursor.com/for/debugging)

---

## Delivery Plan

### Phase 1 — Local PostgreSQL foundation (R1–R3)

#### Tasks

- [x] `P1.T1` Define a disposable Compose PostgreSQL service, local connection configuration, and startup, reset, and cleanup instructions.
      Scope setup and cleanup to a dedicated local demo database. Keep test data in a separate disposable database.
- [x] `P1.T2` Add Drizzle and PostgreSQL tooling, the shared database composition, and schemas for committed observations and per-object
      latest state. Enforce observation ID uniqueness in PostgreSQL. Generate the initial migration through the configured tool.
- [x] `P1.T3` Document the local setup and verify the migration and cleanup commands against the disposable database created for this phase.

#### Expected Files

- `compose.yaml`, `.env.example`, `package.json`, `package-lock.json`, Drizzle config and generated migrations, `src/data/db/`,
  `src/dependencies/`, TypeScript configuration, and `README.md`.

#### Validation

- Verified Compose startup, initial and repeat migrations, reset, and cleanup with separate demo and test projects. Checked timestamp
  round-trip, global observation ID uniqueness, same-object latest pointers, and isolation between the two databases.
- Passed `npm run typecheck`, `npm run format:check`, `npm test` (3 tests), and `npm run build`. A second `npm run db:generate` found no
  schema changes.
- Replaced the test Compose project with Testcontainers. Passed `npm run test:integration` against a fresh PostgreSQL container.

#### Gate

- Passed. The documented workflow created, migrated, reset, and removed the disposable database.

### Phase 2 — Observable API baseline (R1–R3)

#### Tasks

- [x] `P2.T1` Define and validate the observation contract. Use a client-supplied UUID for `observationId`, an opaque satellite identifier
      such as `SAT-1042` for `objectId`, and an offset-bearing timestamp compared at millisecond precision and returned in UTC. Use
      `/v1/observations/:observationId` as the created resource identifier in `Location`.
- [x] `P2.T2` Wire ingestion and latest-read routes through the controller, service, and repository. Keep the vulnerable behavior scoped to
      concurrent selection of the latest observation. Preserve committed ingestion, duplicate rejection, and normal sequential behavior.
- [x] `P2.T3` Add real HTTP integration coverage for the sequential contract, including equal instants with different offsets, late arrival,
      object isolation, duplicate rejection, and existing heartbeat behavior. Document the endpoints and local commands.
- [x] `P2.T4` Require the observation service and mount its routes unconditionally. Fail startup when `DATABASE_URL` is missing and let
      PostgreSQL connection errors surface when an observation request uses the database.
- [x] `P2.T5` Assemble the pool and observation service in `dependencies/app.dependencies.ts`. Export the observation router and its
      controller handlers directly.
- [x] `P2.T6` Export the Express app directly and configure its observation service and CORS policy before listening.
- [x] `P2.T7` Configure CORS in the app, move PostgreSQL configuration and pool creation into the data client, and have controllers call the
      observation repository through the shared context.

#### Expected Files

- `src/app.ts`, `src/server.ts`, observation routes and controller, validation and response models, service and repository modules, database
  composition, `test/integration/`, `.env.example`, and `README.md`.

#### Validation

- Passed nine PostgreSQL integration tests, including the migration smoke test and the observation HTTP contract. Passed three existing HTTP
  tests. Verified startup and graceful shutdown of the compiled server with PostgreSQL configured.
- Passed `npm run typecheck`, `npm run format:check`, `npm test`, `npm run test:integration`, and `npm run build`.
- An exploratory HTTP run on the compiled server acknowledged 160 concurrent writes and observed stale selections. Phase 3 owns the
  repeatable workload and calibration.
- After simplifying startup, reran type checking, formatting, all three HTTP tests, all nine PostgreSQL integration tests, and the build.
  Confirmed that the compiled server exits before listening when `DATABASE_URL` is missing.
- After moving dependency assembly and exporting the router directly, reran formatting, type checking, the build, three HTTP tests, and nine
  PostgreSQL integration tests. All passed.
- After exporting the app directly, the same checks passed. The compiled app also imports without starting a listener.
- After adopting the shared data client and repository context, the same checks passed. Verified that the compiled server rejects a missing
  database URL and that the configured app imports without starting a listener.
- After moving JSON parsing into `app.ts`, the new malformed-body test failed with 404 before the change and passed with 400 after it.
  Formatting, type checking, the build, four HTTP tests, and nine PostgreSQL integration tests passed.

#### Gate

- Passed. The observation API meets the sequential contract against real PostgreSQL and preserves the heartbeat.

### Phase 3 — Standalone workload and calibration (R3–R4)

#### Tasks

- [x] `P3.T1` Implement `npm run demo:reproduce` as a standalone HTTP client. Generate run-scoped observations in seeded mixed timestamp
      order, enforce the concurrency limit, and wait for all requests before querying latest state. Keep fixture preparation separate from
      the HTTP client.
- [x] `P3.T2` Verify clean, regression, request failure, and ambiguous-commit results. Cover the limit and result classification without
      depending on a real race for those tests. Document the CLI and output as a customer incident report.
- [x] `P3.T3` Calibrate a primary and alternate workload on the demo machine. Record seed, load parameters, and independent run outcomes in
      the prep workspace.
- [x] `P3.T4` Save each invocation's report as timestamped Markdown in the ignored root `.output/` folder and print its path.

#### Expected Files

- `scripts/reproduce-incident.ts`, `package.json`, `tsconfig.json` if needed to type-check scripts, `test/`, and `README.md`.

#### Validation

- Passed `npm run typecheck`, `npm run format:check`, `npm test` (11 tests), `npm run test:integration` (9 tests), and `npm run build`. The
  HTTP fixtures cover bounded concurrency, round isolation, clean and stale results, rejected submissions, lost responses, and failed
  lookups.
- Calibrated against the compiled pre-fix API on this machine using disposable PostgreSQL 18 and a fresh synthetic ID namespace per
  invocation. The **default** used 160 observations per round, 80 in flight, 4 objects, 2 rounds, and seed 73. In the final ten independent
  runs, stale selections per round were `1/0, 1/0, 1/0, 1/0, 2/0, 0/0, 1/0, 1/0, 1/0, 2/0`. All 3,200 writes succeeded.
- The **alternate** used 500 observations, 80 in flight, 2 objects, 1 round, and seed 17. Stale selections across ten independent runs were
  `0, 1, 1, 1, 1, 1, 1, 1, 1, 1`. All 5,000 writes succeeded. Every reported mismatch in both profiles returned an older timestamp.
- After adding Markdown reports, formatting, type checking, the build, 12 HTTP and script tests, and 9 PostgreSQL integration tests passed.
  Tests verify saved reports for clean, stale, failed, inconclusive, and invalid-input runs. Git ignores the generated output folder.

#### Gate

- Passed. The final default and alternate profiles each reproduced the regression in 9 of 10 independent runs with successful ingestion. The
  live Cursor diagnosis and repair remain for the interview.

### Blockers

- None currently.
