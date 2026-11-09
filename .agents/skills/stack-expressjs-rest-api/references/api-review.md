# API Review Checklist

Run the checks relevant to the change. Report what passed and explain any relevant gaps.

## Wiring and Configuration

- Installed Express, TypeScript, schema, and middleware versions inspected; no automatic framework migration or snapshot patch pinning.
- Package module type, compiler settings, and import specifiers agree with the target Node runtime. New starters include Helmet and CORS
  as runtime dependencies and `@types/cors` as a development dependency.
- App mounts and router paths compose exactly once; handlers, schema names, imports, repository methods, and Location headers agree.
- Importing the app leaves the listener closed. Supply runtime configuration or test substitutes before loading dependencies.
- Proxy trust matches the deployed topology, CORS matches the project contract, public endpoints/preflight remain reachable as intended.
- Separate background workers do not execute HTTP authentication middleware.
- When Lambda Web Functions is selected, check the listen address, packaged entrypoint/dependencies, endpoint authentication, concurrency,
  and rollout settings using [lambda-web-functions.md](lambda-web-functions.md). Report deployed checks separately from local validation.

## Error Contracts

- Existing envelopes, statuses, type URIs, reasons, field keys, auth headers, CORS, and success contracts are preserved unless migration is
  explicitly requested. New contracts follow [problem-details.md](problem-details.md).
- Problem Details JSON uses `application/problem+json`; body status matches HTTP status when present. Extensions stay top-level and cannot
  override standard members. Optional fields/files are relevant and contain safe arrays of messages.
- Missing/malformed input, nested/root/multiple validation issues, expected domain errors, auth failures, and safe generic 500s are checked
  through real middleware. JSON has one parsing owner.
- Safe public messages and redacted logs contain no sensitive payloads, credentials, or internal diagnostics. Authorization precedes
  sensitive disclosure; intentional non-disclosure remains intact.
- Application coverage is distinguished from unverified Gateway/authorizer/proxy behavior. No unrelated infrastructure customization,
  auth redesign, or deployment is introduced. See [testing-pattern.md](testing-pattern.md) for response checks.

## Behavior and Boundaries

- Success, relevant not-found/conflict cases, and bodyless 204 responses preserve status, body, headers, and pagination contracts.
- Body/path/query failures and malformed JSON use the agreed format. When the handler needs schema transformations, coercions, or
  defaults, it receives the parsed values.
- Authentication and group/scope/resource authorization prevent controller execution and writes when rejected. Trusted identity is verified.
- Unexpected async failures reach the four-parameter error handler; headers-sent failures delegate; sensitive diagnostics stay out of responses.
- Persistence stays in repositories, shared clients/context stay in composition, and services own workflows/integrations where needed.
- Cross-system cleanup retains failed work and is retryable when applicable; database deletion does not falsely imply physical object cleanup.

## Evidence and Handoff

- Relevant type checks, tests, and build pass. Real middleware is exercised through HTTP requests; test mocks do not bypass the behavior claimed.
- For starter, build, or entrypoint changes, start the compiled app with the target Node version and request `GET /heartbeat` or the
  project's health route. Verify the emitted entrypoint and imports work with the production module settings.
- Tests use deterministic configuration, mocked external boundaries, disposable persistence where needed, and no unexpected outbound calls
  or unasserted warning/error logs. Local tests are distinguished from deployed authentication and live integration checks.
- Report implemented routes, configuration/contract changes, checks and results, and limitations. Include useful snippets in the handoff.
- Update the active `stack-spec-workflow` Delivery Plan section or legacy active plan; do not add competing plans or approval gates.
