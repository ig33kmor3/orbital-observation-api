# Isolated API Testing

Use the existing runner and test layout. Exercise the real Express app, router, parsers, validation, authorization, and error middleware;
replace external collaborators through existing seams. Importing `app.ts` must not start the server or load developer env files.

- Set deterministic configuration before importing composition. Never inherit developer database URLs, AWS profiles, or credentials.
- Mock token verification and external service/database boundaries in HTTP composition tests. Keep authentication/group checks and validation
  real. These tests prove application behavior, not real issuer discovery, signature verification, or deployed authentication.
- For actual SQL behavior, use a disposable Testcontainers database with committed migrations and required fixtures. Verify constraints,
  transactions, and concurrency in the real engine; do not substitute mocked query chains or target a shared/deployed database.
- Block unexpected outbound traffic through the runner's existing harness, including failures swallowed by the application. Allow only the
  deliberate local transport used by HTTP tests and disposable containers. A fetch-only guard does not cover Node HTTP or every AWS client.
- Assert expected error logs within their tests; keep the normal unexpected-warning/error guard active. Do not globally silence console.
- Run type checking and the relevant build separately from tests. For regression fixes, confirm the test fails before the fix and passes
  after. Report local tests and live checks as separate evidence.

## Deterministic Setup

Register this through the runner's setup mechanism before importing application composition. Only include the actual keys the project uses.
Mocking repositories does not make it safe to inherit production configuration.

```ts
// test/setup-environment.ts
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'https://ui.example.invalid';
process.env.COGNITO_USER_POOL_ID = 'us-east-1_EXAMPLE';
process.env.COGNITO_APP_CLIENT_IDS = 'example-client-id';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/blocked';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_EC2_METADATA_DISABLED = 'true';
delete process.env.AWS_PROFILE;
delete process.env.AWS_SESSION_TOKEN;
```

## HTTP Composition Tests

This Vitest/Supertest example follows the connected references; adapt to Jest or another existing runner without installing a second runner.
Supertest uses an ephemeral local listener, not a deployed endpoint. Error assertions assume the new Problem Details examples;
for established APIs assert their existing envelope instead. The setup file above supplies configuration before app import.

```ts
// test/items.test.ts
import { beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';

const { verify, items } = vi.hoisted(() => ({
  verify: vi.fn(),
  items: {
    findById: vi.fn(), findAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
  },
}));

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: () => ({ verify }) },
}));
vi.mock('../src/dependencies/app.dependencies.ts', () => ({ context: { items } }));

import { app } from '../src/app.ts';

const id = '550e8400-e29b-41d4-a716-446655440000';

beforeEach(() => {
  vi.resetAllMocks();
  verify.mockResolvedValue({ sub: 'user-1', 'cognito:groups': ['editors'] });
});

it('uses the mounted path and passes trimmed schema output to persistence', async () => {
  items.create.mockResolvedValue({ id, name: 'Example' });
  const response = await request(app).post('/v1/items')
    .set('Authorization', 'Bearer test-token').send({ name: '  Example  ' });

  expect(response.status).toBe(201);
  expect(response.headers.location).toBe(`/v1/items/${id}`);
  expect(items.create).toHaveBeenCalledWith({ name: 'Example' });
});

it('passes coerced query values to the repository', async () => {
  items.findAll.mockResolvedValue({ limit: 2, nextCursor: null, items: [] });
  const response = await request(app).get('/v1/items?limit=2')
    .set('Authorization', 'Bearer test-token');

  expect(response.status).toBe(200);
  expect(items.findAll).toHaveBeenCalledWith({ limit: 2 });
});

it('rejects a missing token before executing a write', async () => {
  const response = await request(app).post('/v1/items').send({ name: 'Example' });

  expect(response.status).toBe(401);
  expect(response.body.status).toBe(401);
  expect(response.headers['www-authenticate']).toBe('Bearer');
  expect(verify).not.toHaveBeenCalled();
  expect(items.create).not.toHaveBeenCalled();
});

it('rejects insufficient groups before executing a write', async () => {
  verify.mockResolvedValue({ sub: 'user-2', 'cognito:groups': ['readers'] });
  const response = await request(app).post('/v1/items')
    .set('Authorization', 'Bearer test-token').send({ name: 'Example' });

  expect(response.status).toBe(403);
  expect(items.create).not.toHaveBeenCalled();
});

it('rejects invalid schema input before executing a write', async () => {
  const response = await request(app).post('/v1/items')
    .set('Authorization', 'Bearer test-token').send({ name: '   ' });

  expect(response.status).toBe(400);
  expect(response.headers['content-type']).toMatch(/^application\/problem\+json(?:;|$)/);
  expect(response.headers['access-control-allow-origin']).toBe('https://ui.example.invalid');
  expect(response.body).toMatchObject({
    type: 'about:blank', title: 'Bad Request', status: 400, reason: 'InvalidFields',
    fields: { name: ['Enter a name.'] },
  });
  expect(items.create).not.toHaveBeenCalled();
});

it('maps malformed JSON through the agreed error format', async () => {
  const response = await request(app).post('/v1/items')
    .set('Content-Type', 'application/json').send('{');

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    type: 'about:blank', title: 'Bad Request', status: 400, detail: 'Malformed JSON body', reason: 'InvalidRequest',
  });
  expect(response.body.fields).toBeUndefined();
  expect(response.headers['access-control-allow-origin']).toBe('https://ui.example.invalid');
  expect(items.create).not.toHaveBeenCalled();
});

it('retains both parsed params and body through update middleware', async () => {
  items.update.mockResolvedValue({ id, name: 'Updated' });
  const response = await request(app).put(`/v1/items/${id}`)
    .set('Authorization', 'Bearer test-token').send({ id, name: '  Updated  ' });

  expect(response.status).toBe(204);
  expect(response.text).toBe('');
  expect(items.update).toHaveBeenCalledWith(id, { id, name: 'Updated' });
});
```

Also cover invalid/expired tokens, invalid params/query, missing resources, conflicts, public health/preflight, and unexpected async errors
where relevant. Assert controller non-execution directly when the test seam permits it; repository assertions above prove no write occurred.
For an expected 500-path log, scope the spy and assert both the response and log:

```ts
const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
try {
  items.findById.mockRejectedValue(new Error('internal diagnostic'));
  const response = await request(app).get(`/v1/items/${id}`)
    .set('Authorization', 'Bearer test-token');
  expect(response.status).toBe(500);
  expect(response.body.detail).toBe('An unexpected error occurred');
  expect(response.body.status).toBe(500);
  expect(response.text).not.toContain('internal diagnostic');
  expect(errorLog).toHaveBeenCalledWith('Unexpected request failure');
} finally {
  errorLog.mockRestore();
}
```

## Error Contract Coverage

For an existing API, assert its established envelope and identifiers; do not migrate them to satisfy these examples. When Problem Details
is used, exercise these observable responses with real middleware and the existing runner:

- HTTP status matches body `status` when present; content type is `application/problem+json` (allow a charset parameter).
- Configured CORS is present on application errors, including parsing, validation, authorization, and unexpected failures.
- Missing body, malformed JSON, and body/query/path schema failures retain the agreed statuses and optional extensions.
- Field messages preserve multiple issues, nested/array paths such as `items.0.name`, root-level issues, and dictionary keys such as
  `__proto__`. Use safe fixture messages and verify rejected sensitive values are absent.
- Parsed/coerced/defaulted values reach controllers; JSON is parsed once. Failed validation does not execute business logic.
- Expected not-found/conflict reasons remain stable; fields/files appear only when relevant and access has been checked.
- Authentication/permission failures retain 401/403 or intentional 404 and required authentication headers. No unauthorized writes or
  sensitive resource disclosures occur.
- Unexpected exceptions produce safe generic 500 details; responses contain no stack traces, driver/SDK details, credentials, or sensitive
  rejected values. Scope expected-log spies to their test and assert redaction; do not globally mute logs.
- Success envelopes, Location headers, pagination, and bodyless 204 responses remain unchanged.

Use local deterministic fixtures and mocked external boundaries. Keep the parser/auth/error middleware under test real instead of replacing
it with a broad mock. Record deployed authorizer, Gateway/proxy, and live integration behavior as unverified unless separately checked.
