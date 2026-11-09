# Route Pattern

Compose authorization, validation, and controller handlers in the existing router. In a new router module, create the router at module
scope and export it directly. The app owns JSON parsing. Keep public routes explicit.

## Baseline Example

```ts
// src/routes/item.route.ts
import { Router } from 'express';
import { authorize } from '../middlewares/authorize.middleware.ts';
import { createItemHandler, getItemByIdHandler, updateItemHandler } from '../controllers/item.controller.ts';
import { validateItemPath } from '../middlewares/validate-item.middleware.ts';
import { validateBody } from '../middlewares/validation.middleware.ts';
import { itemPostDtoSchema, itemPutDtoSchema } from '../models/validation/item.validation.ts';

// Use the project's approved groups or scopes.
const allowedGroups = ['editors'];
const router = Router();

/**
 * GET /v1/items/:itemId
 */
router.get('/items/:itemId', authorize(allowedGroups), validateItemPath, getItemByIdHandler);

/**
 * POST /v1/items
 */
router.post('/items', authorize(allowedGroups), validateBody(itemPostDtoSchema), createItemHandler);

/**
 * PUT /v1/items/:itemId
 */
router.put('/items/:itemId', authorize(allowedGroups), validateItemPath, validateBody(itemPutDtoSchema), updateItemHandler);

export default router;
```

## Guidance

- `Router({ mergeParams: true })` preserves `req.params` from parent routers in nested route trees when nested routing is already part of the repository
- If the repository already has router modules, extend them. If it does not, generate router modules rather than registering every resource directly in the app bootstrap.
- If the repository already uses explicit `authorize(getAllowedGroups())` calls on each route, preserve that style
- Chain validation before the handler. Validate path parameters before the body.
- For public routes (e.g. health check or token-based share-link routes), register them on the app bootstrap or a public router without `authorize()`
- If the app mounts routers under `/v1`, keep route modules aligned with that prefixing strategy
- Mount the router from one centralized bootstrap or route-composition layer

The app example mounts this router at `/v1`, so the resulting paths are `/v1/items` and `/v1/items/:itemId`. Do not mount it at
`/v1/items` again. Preserve another established prefix convention consistently across app, router, Location headers, and tests.
