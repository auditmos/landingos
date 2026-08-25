---
paths:
  - "apps/data-service/**/*.ts"
---

# Hono Framework Rules

## App Setup

- Type bindings via `Hono<{ Bindings: Env }>`
- Access env via `c.env`, not `process.env`
- Export `app.fetch` for Workers

```ts
import { Hono } from 'hono'
import type { Env } from './types'

const app = new Hono<{ Bindings: Env }>()

export default {
  fetch: app.fetch,
}
```

## Middleware Chain

Apply in order: requestId → errorHandler → cors → auth → rateLimiter → validator

```ts
app.use('*', requestId())
app.use('*', errorHandler())
app.use('*', cors())
app.use('/api/*', authMiddleware())
app.use('/api/*', rateLimiter())
```

## Route Structure

- Handlers: thin wrappers, call services
- Services: business logic, call data-ops queries
- Keep handlers focused on HTTP concerns

```ts
// handlers/users.ts
export const getUser = async (c: Context) => {
  const { id } = c.req.param()
  const result = await userService.getById(c.env, id)
  if (!result) return c.json({ error: 'Not found' }, 404)
  return c.json(result)
}
```

## Request Validation

**ALWAYS** import named schemas from `@repo/data-ops/{domain}` and validate with
`safeParse` — never write an inline `z.object()` in a handler. If a schema does not
exist yet, create it in the appropriate `data-ops` domain first.

```ts
// CORRECT — named schema from data-ops, typed Polish rejection
import { FlightLookupRequestSchema } from "@repo/data-ops/flight";

const parsed = FlightLookupRequestSchema.safeParse(await c.req.json());
if (!parsed.success) {
	return c.json({ code: "FLIGHT_LOOKUP_INVALID", error: "Nieprawidłowe dane lotu." }, 400);
}

// WRONG — inline schema
const parsed = z.object({ id: z.string().uuid() }).safeParse(body);

// WRONG — unguarded parse, throws into the generic 500
const data = FlightLookupRequestSchema.parse(body);
```

## Error Handling

Services throw one typed error class per module carrying `code` and `status` (e.g.
`FlightRoomServiceError`); handlers map it and rethrow anything else. Never throw
`HTTPException` and never add a second error model — see
`.claude/rules/error-handling.md` for the full contract.

`middleware/error-handler.ts` is the last-resort boundary, not a routing table: it
returns one generic Polish 500 with the request id. An internal message must never
reach a client body — a `DrizzleQueryError.message` is `"Failed query: <SQL>\nparams:
<values>"` — and by the S8 privacy invariant it must not reach the logs either, so
that file stays free of `console.*`.

```ts
// handlers/room-handlers.ts — map the typed error, rethrow the rest
function serviceError(c: Context, error: unknown) {
	if (!(error instanceof FlightRoomServiceError)) throw error;
	return c.json({ code: error.code, error: error.message }, error.status);
}
```

## Response Patterns

```ts
// Success
return c.json({ data: user })
return c.json({ data: users, meta: { total, page } })

// Error
return c.json({ error: 'Not found' }, 404)
return c.json({ error: 'Validation failed', details: errors }, 400)
```
