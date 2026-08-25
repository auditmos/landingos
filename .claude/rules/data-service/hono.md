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

**ALWAYS** import named schemas from `@repo/data-ops/{domain}` and read the body with
`parseJsonBody` from `hono/utils/request-body` — never write an inline `z.object()` in
a handler, and never call `c.req.json()` directly. If a schema does not exist yet,
create it in the appropriate `data-ops` domain first.

```ts
// CORRECT — named schema from data-ops, typed Polish rejection
import { FlightLookupRequestSchema } from "@repo/data-ops/flight";
import { parseJsonBody } from "../utils/request-body";

const body = await parseJsonBody(c, FlightLookupRequestSchema, {});
if (!body.ok) {
	return c.json({ code: "FLIGHT_LOOKUP_INVALID", error: "Nieprawidłowe dane lotu." }, 400);
}

// WRONG — inline schema
const parsed = z.object({ id: z.string().uuid() }).safeParse(body);

// WRONG — unguarded parse, throws into the generic 500
const data = FlightLookupRequestSchema.parse(body);

// WRONG — hand-rolled read; the stand-in drifts per handler
const parsed = Schema.safeParse(await c.req.json().catch(() => ({})));
```

The third argument is what an unparsable body (malformed JSON, empty body, no
`Content-Type`) is handed to the schema as, and it is **not** cosmetic:

| Rejection body | Stand-in | Why |
|---|---|---|
| `{ status: "validation_error", fieldErrors }` | `{}` | every required field reports; `undefined` would ship `fieldErrors: {}` to a frontend that renders per field |
| a fixed `{ code, error }` | `undefined` | only success-or-failure is read |

Rejection copy must be the family's own Polish string. A zod issue message is safe to
forward **only** when it comes from a field-level issue (`issue.path.length > 0`) —
zod's top-level `"Invalid input: expected object, received undefined"` is English and
must never reach the wire (this leaked from `POST /rooms/:roomId/messages` until #47).

`operator-catalog`'s `POST /:id/publish` is the one documented exception and still
reads its body by hand: it must tell an absent body (publish the saved draft) apart
from `{}`, which no stand-in preserves.

### Why not `zValidator` (measured, #47)

`@hono/zod-validator` is **not** used and is not a dependency. It wraps
`hono/validator`, which on Hono 4.13.2:

- throws `HTTPException(400, "Malformed JSON in request body")` **before** the
  validation hook runs — so a malformed body answers in English plain text and the
  hook cannot produce the family's Polish `{ code, error }` at all;
- discards a valid body that arrives without a JSON `Content-Type`, validating `{}`
  instead — a silent wire break for native clients;
- runs as route middleware, so it would preempt the `ROOM_ID_INVALID` param check on
  every `/:roomId` route.

`src/hono/utils/request-body.test.ts` pins all three. If that test ever fails because
Hono changed, this decision is due for a rerun.

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
