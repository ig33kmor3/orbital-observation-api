# Middleware Pattern

Reuse existing auth and validation helpers. For new patterns, the examples below authenticate before controller execution, preserve parsed
schema output, and translate failures into one response format. Use the project's existing scopes and resource-ownership checks as needed;
a group check alone does not authorize every record.

## Authentication and Group Authorization

Define shared middleware-added request context once. Reuse the project's existing request type when available; otherwise use a small
extension like this. Keep `user` optional because public requests and requests before authentication have no verified identity.

```ts
// src/models/authenticated-request.ts
import type { Request } from 'express';
import type { CognitoAccessTokenPayload } from 'aws-jwt-verify/jwt-model';

/**
 * Express request with an optional verified access token.
 */
export type AuthenticatedRequest = Request & {
  user?: CognitoAccessTokenPayload;
};
```

```ts
// src/middlewares/authorize.middleware.ts
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { CognitoAccessTokenPayload } from 'aws-jwt-verify/jwt-model';
import type { RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../models/authenticated-request.ts';
import { AuthenticationError, AuthorizationError } from '../utilities/errors.ts';

const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientIds = process.env.COGNITO_APP_CLIENT_IDS?.split(',')
  .map((id) => id.trim()).filter((id) => id.length > 0);

if (!userPoolId || !clientIds?.length) {
  throw new Error('Cognito user pool and allowed app clients must be configured.');
}

const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId,
  tokenUse: 'access',
  clientId: clientIds,
});

/**
 * Verifies the access token and enforces group membership when configured.
 */
export const authorize = (allowedGroups?: string[]): RequestHandler =>
  async (request: AuthenticatedRequest, _response, next): Promise<void> => {
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization || '');
    if (!match) {
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    let payload: CognitoAccessTokenPayload;
    try {
      payload = await jwtVerifier.verify(match[1]);
    } catch {
      throw new AuthenticationError('Invalid or expired token');
    }

    const groups = payload['cognito:groups'] || [];
    if (allowedGroups && !groups.some((group) => allowedGroups.includes(group))) {
      throw new AuthorizationError('You do not have permission to access this resource');
    }

    request.user = payload;
    next();
  };
```

Load configuration before importing auth middleware, as shown in [app-pattern.md](app-pattern.md). The shared verifier checks access-token
use, issuer, expiry, and allowed clients; missing configuration fails startup. Do not decode an unverified token as identity. `authorize()` authenticates;
`authorize(['editors'])` also restricts groups, and an empty allowed list denies everyone. Keep public routes explicit and leave applicable
CORS preflight handling before authentication. Scope and ownership checks use trusted identity, never caller-supplied ownership fields.

Middleware assigns `request.user` only after verification. Controllers that read it use the same `AuthenticatedRequest` type; controllers
that do not need identity keep ordinary `RequestHandler` declarations. See [controller-pattern.md](controller-pattern.md). Use a consistent validation handoff for each request target.

## Rejection-Only Validation

Use this pattern when the handler needs the original values and the schema only checks that they are acceptable. Assign the parse result to
a named variable, return after sending an error, and call `next()` on success. The handler can read the validated value from the same
request field, using the schema's input type where an explicit type is needed.

```ts
// src/middlewares/validate-item.middleware.ts
import type { RequestHandler } from 'express';
import { itemPathSchema } from '../models/validation/item.validation.ts';
import { sendProblem } from '../utilities/problem-response.ts';
import { StatusCode } from '../utilities/status-code.ts';

/**
 * Rejects invalid item IDs before the controller runs.
 */
export const validateItemPath: RequestHandler = (request, response, next) => {
  const paramsValidation = itemPathSchema.safeParse(request.params);
  if (!paramsValidation.success) {
    sendProblem(response, StatusCode.BAD_REQUEST, 'Provide a valid item ID');
    return;
  }

  next();
};
```

The [route example](route-pattern.md) mounts this middleware before the read and update handlers. Those handlers read
`request.params` directly, as shown in the [controller example](controller-pattern.md).

## Parsed Request Validation

Use the parsed result when a handler depends on defaults, coercion, or transformations. A successful parse leaves the original request
values as they were.

Keep three small middleware functions so route composition is easy to read. Merge targets into `validated` so body validation does not erase
previously validated path parameters. Do not assign to `request.query` in Express 5. These examples use the Problem Details helper in
[error-pattern.md](error-pattern.md) and formatter in [problem-details.md](problem-details.md). Keep explicit safe schema messages.
`express.json()` owns JSON parsing; validation reads its output, including undefined for a missing body.

```ts
// src/middlewares/validation.middleware.ts
import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { sendProblem } from '../utilities/problem-response.ts';
import { StatusCode } from '../utilities/status-code.ts';
import { formatZodIssues } from '../utilities/validation.ts';

/**
 * Parses and stores the validated request body.
 */
export const validateBody = (schema: ZodType): RequestHandler =>
  (request, response, next): void => {
    const bodyValidation = schema.safeParse(request.body);
    if (!bodyValidation.success) {
      sendProblem(response, StatusCode.BAD_REQUEST, 'Invalid request body', {
        reason: 'InvalidFields',
        fields: formatZodIssues(bodyValidation.error.issues),
      });
      return;
    }

    response.locals.validated = { ...response.locals.validated, body: bodyValidation.data };
    next();
  };

/**
 * Parses and stores the validated query parameters.
 */
export const validateQuery = (schema: ZodType): RequestHandler =>
  (request, response, next): void => {
    const queryValidation = schema.safeParse(request.query);
    if (!queryValidation.success) {
      sendProblem(response, StatusCode.BAD_REQUEST, 'Invalid query parameters', {
        reason: 'InvalidFields',
        fields: formatZodIssues(queryValidation.error.issues),
      });
      return;
    }

    response.locals.validated = { ...response.locals.validated, query: queryValidation.data };
    next();
  };

/**
 * Parses and stores the validated path parameters.
 */
export const validateParams = (schema: ZodType): RequestHandler =>
  (request, response, next): void => {
    const paramsValidation = schema.safeParse(request.params);
    if (!paramsValidation.success) {
      sendProblem(response, StatusCode.BAD_REQUEST, 'Invalid parameters', {
        reason: 'InvalidFields',
        fields: formatZodIssues(paramsValidation.error.issues),
      });
      return;
    }

    response.locals.validated = { ...response.locals.validated, params: paramsValidation.data };
    next();
  };
```

Use `safeParseAsync` and async middleware when schemas have asynchronous refinements. Test that values produced by a schema reach the
controller when they affect application behavior.

## Global Error Mapping

Express 5 forwards rejected async handlers to error middleware. Keep all four parameters and delegate when headers were already sent.
Malformed JSON fails in `express.json()` before route validation; identify its parser metadata rather than treating every `SyntaxError` as
bad user input. Add other parser failures only when relevant to the API contract. The mapped domain errors below guarantee safe public
messages; unknown exceptions do not. Preserve existing reasons and authentication challenges instead of adopting the illustrative ones.

```ts
// src/middlewares/global-error.middleware.ts
import type { ErrorRequestHandler } from 'express';
import { sendProblem } from '../utilities/problem-response.ts';
import {
  AuthenticationError, AuthorizationError, ConflictError, NotFoundError, ValidationError,
} from '../utilities/errors.ts';
import { StatusCode } from '../utilities/status-code.ts';

/**
 * Translates application and parser errors into safe HTTP responses.
 */
export const globalErrorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  let status = StatusCode.INTERNAL_SERVER_ERROR;
  let reason: string | undefined;
  let message = 'An unexpected error occurred';

  const malformedJson = error instanceof SyntaxError
    && 'type' in error && error.type === 'entity.parse.failed'
    && 'status' in error && error.status === StatusCode.BAD_REQUEST;

  if (malformedJson) {
    status = StatusCode.BAD_REQUEST;
    reason = 'InvalidRequest';
    message = 'Malformed JSON body';
  } else if (error instanceof ValidationError) {
    status = StatusCode.BAD_REQUEST;
    reason = 'InvalidFields';
    message = error.message;
  } else if (error instanceof AuthenticationError) {
    status = StatusCode.UNAUTHORIZED;
    reason = 'AuthenticationRequired';
    response.set('WWW-Authenticate', 'Bearer');
    message = error.message;
  } else if (error instanceof AuthorizationError) {
    status = StatusCode.FORBIDDEN;
    reason = 'PermissionDenied';
    message = error.message;
  } else if (error instanceof NotFoundError) {
    status = StatusCode.NOT_FOUND;
    reason = 'NotFound';
    message = error.message;
  } else if (error instanceof ConflictError) {
    status = StatusCode.CONFLICT;
    reason = 'Conflict';
    message = error.message;
  }

  if (status === StatusCode.INTERNAL_SERVER_ERROR) {
    // Replace with the existing redacting logger; raw exceptions may contain sensitive data.
    console.error('Unexpected request failure');
  }

  sendProblem(response, status, message, reason ? { reason } : {});
};
```

Map only errors whose messages are safe for clients. Preserve existing controller-local translation where required by the response contract.
Do not include stack traces, tokens, or raw malformed bodies in responses. See the official
[error handling guide](https://expressjs.com/en/guide/error-handling/).
