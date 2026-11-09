# Problem Details Contract

Use this reference when implementing or reviewing error contracts. Inspect existing callers and helpers first. Preserve existing
contracts unless migration is requested; the examples describe new contracts and do not rename an existing API's fields or reasons.

## Standard and Application Conventions

Follow [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html):

- Serialize JSON problems with `Content-Type: application/problem+json`.
- Standard members are `type`, `title`, `status`, `detail`, and `instance`; they are not all required.
- `type` is a URI reference and is the primary problem-type identifier. Omission means `about:blank`; do not require a custom URI.
- For `about:blank`, use the HTTP status phrase as the title (localization is allowed). `detail` describes this occurrence.
- If supplied, body `status` must match the generated HTTP response status.
- `instance` is an optional occurrence URI reference. Do not add it automatically or expose sensitive request URLs.
- Human-readable titles/details are not stable machine identifiers. Do not parse messages to select client behavior.

These are optional application conventions, not RFC requirements:

- `reason`: stable application code, for example `InvalidFields` or `UnitConflict`.
- `fields`: field paths mapped to arrays of safe validation messages.
- `files`: upload identifiers mapped to arrays of safe messages.
- Validation status 400 instead of 422. Preserve the project's choice.

Extensions appear at the top level of the JSON body. Do not let them override standard members. Add only extensions relevant to the
failure. Preserve existing validation shapes and root keys; the example below chooses `root` only for a new contract.

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Invalid request body.",
  "reason": "InvalidFields",
  "fields": { "items.0.name": ["Enter a name."] }
}
```

## Safe Zod Issue Mapping

This example assumes the project's installed Zod exports `ZodError`. Preserve its import style and verify the installed version.
Use explicit safe schema messages; do not return rejected values or complete Zod error objects. Multiple issues for one field must survive.

```ts
// src/utilities/validation.ts
import type { ZodError } from 'zod';

export const formatZodIssues = (issues: ZodError['issues']): Record<string, string[]> => {
  // Field names can include Object prototype keys; use a dictionary without a prototype.
  const fields: Record<string, string[]> = Object.create(null);

  for (const issue of issues) {
    const field = issue.path.length > 0 ? issue.path.join('.') : 'root';
    const messages = fields[field] ?? [];
    messages.push(issue.message);
    fields[field] = messages;
  }

  return fields;
};
```

Validate body, query, and path input and pass parsed/coerced/defaulted values downstream. Give JSON parsing one owner: the framework,
Middy parser, or validation middleware. Handle missing bodies, malformed JSON, and schema failures consistently without parsing twice.
A malformed-body response need not contain `fields` when there are no safe field-specific issues.

## Expected Errors and Upload Feedback

Use existing typed domain errors or native framework equivalents. Return `error.message` only when that error guarantees a safe public
message. Do not expose arbitrary database, SDK, storage, or exception messages. Services/repositories throw domain errors; controllers or
existing boundary middleware translate them into HTTP responses. Do not create a new class for every failure.

When relevant, an upload failure can include `reason: 'UploadInvalid'` and `files: { [uploadId]: ['Upload is unavailable.'] }` as top-level
extensions. Validate access before disclosing upload metadata. Upload ownership is separate from permission to modify the parent record.
Never expose credentials, signed URLs, bucket internals, or storage exceptions.

## Authentication, Fallbacks, and Infrastructure

- Preserve 401 versus 403 semantics, relevant `WWW-Authenticate` headers, and intentional 404 responses used for non-disclosure.
- Preserve configured CORS on application-generated failures, including parser, validation, and authorization responses.
- Keep the final generic 500 fallback after expected error mappings. Do not replace deliberate validation/authentication responses.
- Follow middleware execution order and response short-circuit behavior for the installed framework version.
- Use the existing logger with redaction; never log full events, tokens, credentials, or sensitive bodies. Raw exception objects may also
  contain those values. Public responses must not contain stack traces or internal diagnostics.
- A logged Lambda error does not necessarily fail the invocation or increment Lambda Errors when a response is returned.
- Authorizers, API Gateway throttling, proxies, and load balancers may produce different error formats. Report application coverage
  separately from unverified infrastructure behavior. Do not claim universal consistency based on handler tests.
- Keep gateway customization, authentication redesign, and deployment outside an ordinary application change unless authorized.

See the framework-specific response and middleware examples in this skill. Reuse the existing test runner and deterministic fixtures;
exercise real middleware, mock external boundaries, and keep tests free of live-service calls and globally muted logs.
