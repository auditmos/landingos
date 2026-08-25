# Error Handling (Cross-Package)

## Layered Approach

| Layer | Pattern | Location |
|-------|---------|----------|
| DB | Drizzle wraps pg errors in `DrizzleQueryError` | data-ops |
| API services | Throw a typed service error class | data-service `{domain}/service.ts` |
| Frontend | Throw `AppError` from server fns + API client | user-application `core/errors.ts` |

## Drizzle Error Unwrapping

`error.cause` holds original Postgres error, NOT `error.message`.
`error.message` = `"Failed query: <SQL>\nparams: <values>"` — never contains constraint info.
Check `error.cause.code` for pg codes (e.g. `23505` = unique violation).

```ts
function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const cause = error.cause
  if (cause instanceof Error) {
    const pgCode = (cause as Error & { code?: string }).code
    if (pgCode === '23505') return true
  }
  return false
}
```

## Typed service errors (data-service)

Services throw one error class per module carrying `code` and `status` (e.g.
`FlightRoomServiceError`); handlers map it and rethrow anything else:

```ts
function serviceError(c: Context, error: unknown) {
	if (!(error instanceof FlightRoomServiceError)) throw error;
	return c.json({ code: error.code, error: error.message }, error.status);
}
```

Translate typed data-ops errors (e.g. `RoomQueryError`) at the service boundary so
one error currency reaches the handler. Never throw `HTTPException`. Anything that
escapes reaches the global `onError`, which returns a generic Polish 500 and, by the
S8 privacy invariant, logs nothing.

## AppError (user-application)

`AppError` in `core/errors.ts`. Constructor: `new AppError(message, code, status?, field?)`.
Server functions (direct/binding) throw `AppError`.
`api-client.ts` throws `AppError` on `!response.ok`.
Route components use `mutation.isError` / `mutation.error.message`.
