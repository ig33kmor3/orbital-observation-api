# Model Pattern

Keep the repository's model layout and Zod import style. These examples use Zod 4 and separate entities from validation.
Use descriptive PascalCase type aliases for new entity, DTO, and input shapes.

```ts
// src/models/entities/item.model.ts
/**
 * Item entity returned by the repository.
 */
export type Item = {
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
};
```

```ts
// src/models/validation/item.validation.ts
import { z } from 'zod';

export const itemPathSchema = z.object({
  itemId: z.uuid(),
});

export const itemQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().min(1).optional(),
});

export const itemPostDtoSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(128, 'Use at most 128 characters.'),
});

export const itemPutDtoSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, 'Enter a name.').max(128, 'Use at most 128 characters.'),
});

export type ItemPath = z.input<typeof itemPathSchema>;
export type ItemQuery = z.output<typeof itemQuerySchema>;
export type ItemPostDto = z.output<typeof itemPostDtoSchema>;
export type ItemPutDto = z.output<typeof itemPutDtoSchema>;
```

The create handler maps the parsed DTO to an entity before calling the repository.

```ts
// src/utilities/mappers/item.mapper.ts
import { randomUUID } from 'node:crypto';
import type { Item } from '../../models/entities/item.model.ts';
import type { ItemPostDto } from '../../models/validation/item.validation.ts';

/**
 * Builds a new item from validated input.
 */
export const mapCreateItem = (input: ItemPostDto): Item => {
  const now = new Date().toISOString();
  return { id: randomUUID(), name: input.name, createdAt: now, modifiedAt: now };
};
```

- Use safe explicit validation messages when returning schema issues. Never include sensitive rejected values in public messages.
- The body and query schemas use trimming, coercion, or defaults, so handlers consume the parsed output. The path schema checks the
  original value. See [middleware-pattern.md](middleware-pattern.md) for both approaches.
- Keep one schema per validation target. Check repeated/nested query inputs against the actual parser configuration; do not assume a string.
- Defaults, coercions, and transforms are behavior: test that the resulting number, trimmed name, or default reaches application logic.
- Preserve established DTO names and schema layouts. Introduce fields and constraints only when the requested contract needs them.
- Validate cursor structure at the pagination boundary; a base64-looking string alone does not prove a valid cursor.
