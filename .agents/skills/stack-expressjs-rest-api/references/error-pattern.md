# Error Pattern

Reuse existing error classes, native support, and response formatting. For a new contract, use the small Problem Details function below.
Preserve an existing `ErrorResponseBuilder`, `ErrorType`, and custom envelope when extending an established API; do not silently convert
`message`/`details` into `detail`/`fields` or reinterpret its `type` codes as RFC problem types.

Read [problem-details.md](problem-details.md) for RFC rules, optional application extensions, safe validation mapping, and auth boundaries.

## Error Classes

```ts
// src/utilities/errors.ts

export class IdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityError';
  }
}

export class UserNotFoundError extends IdentityError {
  constructor(message: string) {
    super(message);
    this.name = 'UserNotFoundError';
  }
}

export class UserExistError extends IdentityError {
  constructor(message: string) {
    super(message);
    this.name = 'UserExistError';
  }
}

export class UserPasswordError extends IdentityError {
  constructor(message: string) {
    super(message);
    this.name = 'UserPasswordError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
```

## Problem Response Function

Assumes Express 5 and Node.js. This is a project-local function for new contracts when no existing helper is suitable. CORS is owned by
app middleware mounted before parsing/authentication; the function preserves headers already set on the response.
The connected examples use `about:blank`. Preserve custom type URIs/instance handling through an existing helper when the project has them.

```ts
// src/utilities/problem-response.ts
import { STATUS_CODES } from 'node:http';
import type { Response } from 'express';

export type ProblemExtensions = {
  reason?: string;
  fields?: Record<string, string[]>;
  files?: Record<string, string[]>;
};

export type ProblemDetails = ProblemExtensions & {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
};

export const sendProblem = (
  response: Response,
  status: number,
  detail: string,
  extensions: ProblemExtensions = {},
): void => {
  const problem: ProblemDetails = {
    ...extensions,
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'HTTP Error',
    status,
    detail,
  };

  response.status(status).type('application/problem+json').json(problem);
};
```

Supply only application-selected 4xx/5xx statuses; never trust an arbitrary exception's status. No response builder or type registry is
needed. Standard members follow extensions so they cannot be overwritten at runtime. Success responses keep their existing format.

## Global Error Mapping

Use the complete `globalErrorHandler` in [middleware-pattern.md](middleware-pattern.md). It maps shared errors and known parser failures
and remains the fallback when controllers translate expected errors locally. Avoid double mapping and double sends.

Set explicit error names for diagnostics and use the established identification mechanism. The examples use `instanceof` for application
errors and narrow parser metadata. Only the validation/auth/not-found/conflict classes in this example promise safe public messages;
`DatabaseError` and unknown exceptions always receive a generic response. Add classes only when callers need to distinguish their behavior.
