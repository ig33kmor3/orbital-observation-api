# Controller Pattern

Keep controllers readable: consume validated inputs, call repositories or services, and shape HTTP responses. These connected examples use
arrow functions and the shared `context`. Preserve local `try/catch` mappings when the repository already requires them; Express 5 can
forward unexpected async failures automatically.

## Connected Item Handlers

The read route validates the original path parameter. The write routes use parsed body values because the schemas trim names. Use plain
`RequestHandler` declarations and named input types where the handler reads values.

```ts
// src/controllers/item.controller.ts
import type { RequestHandler } from 'express';
import { context } from '../dependencies/app.dependencies.ts';
import type { ItemPath, ItemPostDto, ItemPutDto } from '../models/validation/item.validation.ts';
import { NotFoundError, ValidationError } from '../utilities/errors.ts';
import { mapCreateItem } from '../utilities/mappers/item.mapper.ts';
import { StatusCode } from '../utilities/status-code.ts';

/**
 * GET /v1/items/:itemId
 * Returns the item selected by the validated path.
 */
export const getItemByIdHandler: RequestHandler = async (request, response) => {
  const { itemId } = request.params as ItemPath;
  const item = await context.items.findById(itemId);
  if (!item) {
    throw new NotFoundError('Item not found');
  }

  response.status(StatusCode.OK).json(item);
};

/**
 * POST /v1/items
 * Creates an item and returns its location.
 */
export const createItemHandler: RequestHandler = async (_request, response) => {
  const input: ItemPostDto = response.locals.validated.body;
  const item = mapCreateItem(input);
  const saved = await context.items.create(item);

  response.location(`/v1/items/${saved.id}`).status(StatusCode.CREATED).json(saved);
};

/**
 * PUT /v1/items/:itemId
 * Updates the item selected by the validated path.
 */
export const updateItemHandler: RequestHandler = async (request, response) => {
  const { itemId } = request.params as ItemPath;
  const input: ItemPutDto = response.locals.validated.body;
  if (itemId !== input.id) {
    throw new ValidationError('Item ID does not match the path');
  }

  const changes = { name: input.name, modifiedAt: new Date().toISOString() };
  await context.items.update(itemId, changes);

  response.status(StatusCode.NO_CONTENT).end();
};
```

Use the path assertion only after the route has validated the original path. The global error handler maps `NotFoundError` to 404.
Preserve controller-local mappings when an existing API uses them.

Put record-ownership authorization before reads/writes when required, using trusted identity and repository queries that enforce the actual
access boundary. A router's group authorization does not replace resource-level authorization.

## Reading Shared Request Context

When a controller needs middleware-added identity, annotate its request with the shared type from
[middleware-pattern.md](middleware-pattern.md). Keep the handler declaration simple:

```ts
// src/controllers/current-user.controller.ts
import type { RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../models/authenticated-request.ts';
import { AuthenticationError } from '../utilities/errors.ts';
import { StatusCode } from '../utilities/status-code.ts';

/**
 * Returns the verified caller’s identifier.
 */
export const getCurrentUserHandler: RequestHandler = async (request: AuthenticatedRequest, response) => {
  const user = request.user;
  if (!user) {
    throw new AuthenticationError('Authentication required');
  }

  response.status(StatusCode.OK).json({ id: user.sub });
};
```

Mount this handler after `authorize()` in the existing router. The shared type does not authenticate callers, so check absent identity.
Use the existing validation pipeline for body, path, and query values. Keep the shared request extension focused on identity.
