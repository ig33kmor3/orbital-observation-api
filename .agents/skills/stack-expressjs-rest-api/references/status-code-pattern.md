# Status Code Pattern

Reuse the project's shared HTTP status constants. When none exist, this enum provides a readable baseline; add only the codes needed.

## Baseline Example

```ts
// src/utilities/status-code.ts

export enum StatusCode {
  // 2xx Success
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,

  // 3xx Redirection
  MOVED_PERMANENTLY = 301,
  NOT_MODIFIED = 304,

  // 4xx Client Errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  GONE = 410,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,

  // 5xx Server Errors
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
}
```

## Usage

```ts
import { StatusCode } from '../utilities/status-code.ts';
import { sendProblem } from '../utilities/problem-response.ts';

// In a controller
response.status(StatusCode.OK).json(item);
response.status(StatusCode.CREATED).json(item);
response.status(StatusCode.NO_CONTENT).end();
sendProblem(response, StatusCode.NOT_FOUND, 'Safe public explanation.');
sendProblem(response, StatusCode.CONFLICT, 'Safe public explanation.');
sendProblem(response, StatusCode.INTERNAL_SERVER_ERROR, 'Safe public explanation.');

// In middleware
sendProblem(response, StatusCode.UNAUTHORIZED, 'Safe public explanation.');
sendProblem(response, StatusCode.FORBIDDEN, 'Safe public explanation.');
sendProblem(response, StatusCode.BAD_REQUEST, 'Safe public explanation.');
```

## Guidance

- If the repository already has shared status constants, use them.
- If it does not, introduce one shared status-code module instead of repeating numeric literals.
- Use shared status constants at HTTP boundaries; keep HTTP status handling out of domain/persistence services.
- For new error contracts, use `sendProblem` from [error-pattern.md](error-pattern.md); preserve existing builders and envelopes in established APIs.
- Authentication failures also preserve required challenge headers, as shown in [middleware-pattern.md](middleware-pattern.md).
- Add additional codes as the project needs them; keep the enum the single source of truth
