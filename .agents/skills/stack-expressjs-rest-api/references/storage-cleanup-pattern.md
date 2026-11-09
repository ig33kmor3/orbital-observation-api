# Storage Cleanup Pattern

Use only when the flow spans persistence and external storage, such as attachments or generated exports. Reuse existing storage services,
tracking records, and workers. Keep storage requests in services, datastore operations in repositories, and orchestration out of HTTP middleware.

## Recoverable Deletion

In one database transaction, record the object keys still owed deletion and remove the business rows. After commit, attempt storage cleanup.
Remove owed entries only for successfully deleted objects; retain failures for the existing retry worker. A successful HTTP delete confirms
the agreed business operation, not necessarily physical deletion of every external object. Preserve the application's response contract and
make pending cleanup semantics explicit when material.

For expired uploads/exports, select a bounded batch using persisted keys. Recheck eligibility and preserve atomic claim/expiry protections
before deleting unclaimed uploads. Do not hold a database transaction open across storage calls. Delete objects first, then remove only
tracking rows for successful deletions. A keyless failed export can be removed without a storage request.

## Partial Failure Example

These are application seams, not Express or storage-provider exports. `deleteObjects` returns IDs only for individual successes or verified
absence and throws on transport failure. The repository rechecks expiry during removal. This export cleanup example does not replace the
claim protection required for pending uploads.

```ts
interface ExpiredExport {
  id: string;
  objectKey: string;
}

interface ExportRepository {
  findExpired(limit: number): Promise<ExpiredExport[]>;
  deleteExpired(ids: string[]): Promise<number>;
}

interface StorageService {
  deleteObjects(objects: ExpiredExport[]): Promise<string[]>;
}

export const cleanupExpiredExports = async (
  repository: ExportRepository,
  storage: StorageService,
  batchSize: number,
): Promise<number> => {
  const expiredExports = await repository.findExpired(batchSize);
  if (expiredExports.length === 0) return 0;

  const deletedIds = await storage.deleteObjects(expiredExports);
  const deleted = new Set(deletedIds);
  const removableIds: string[] = [];
  for (const candidate of expiredExports) {
    if (deleted.has(candidate.id)) removableIds.push(candidate.id);
  }
  if (removableIds.length === 0) return 0;

  // Failed objects keep their tracking rows so later work can retry them.
  const removedCount = await repository.deleteExpired(removableIds);
  return removedCount;
};
```

A transport failure leaves all tracking rows intact; the worker must record the failure and arrange retry. A successful request with
per-object failures must retain those failed objects too. Retrying a successful object after a database failure is safe when verified
absence counts as success. Check versioned-storage semantics if physical version removal is required.

Rotate attempts when necessary to prevent persistent failures from starving later batches. Lifecycle rules are a secondary safeguard, not
proof that application cleanup completed. Test success, already-missing objects, partial failure, transport failure, and database failure.
Report removed, retained, and failed work honestly; caught failures require explicit retries. Do not send API bearer tokens to presigned
storage URLs. Use only the storage access required by the service; deployment-specific grants remain outside this Express skill.
