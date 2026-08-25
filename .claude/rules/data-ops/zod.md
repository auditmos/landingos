---
paths:
  - "packages/data-ops/**/*.ts"
---

# Zod v4 Rules

## Schema Definition

- Define schemas in `{domain}/schema.ts`
- Derive types with `z.infer<typeof Schema>`
- Use descriptive schema names ending in `Schema`

```ts
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
})

export type User = z.infer<typeof userSchema>
```

## Polish error copy — set `error`, not just check messages

Every field of a **request** schema needs the type-level `error` parameter *and* its
per-check messages. They are separate zod v4 parameters: a check message answers a
content failure, `error` answers a missing or wrong-typed field. Set only the former
and zod answers absence from its English locale — which reaches every non-browser
consumer verbatim and breaks the Polish-UI constraint on the API surface (#47, #50).

```ts
// Good — both levels; the check message still wins where it applies
z.string({ error: "Podaj numer lotu." }).min(3, "Za krótki.")
z.strictObject({ … }, { error: "Brakuje współrzędnych miejsca docelowego." })

// Bad — "Invalid input: expected string, received undefined" on a missing field
z.string().min(3, "Za krótki.")
// Bad — "Too small: expected string to have >=1 characters"
z.string({ error: "…" }).min(1)
```

`error` is additive and survives `.transform()`, `.superRefine()`, `.refine()`,
`.preprocess()`, `.default()` and `.extend()`. A nested object's issues still flatten
to the **top-level** `fieldErrors` key, so adding copy never moves a key.
`scripts/polish-request-copy-boundary.test.ts` probes every field of every wire-facing
request schema and fails closed on a newly added one.

## Validation Patterns

- Use `safeParse()` for error handling, not `parse()`
- Return structured results, don't throw

```ts
const result = userSchema.safeParse(input)
if (!result.success) {
  return { ok: false, errors: result.error.flatten() }
}
return { ok: true, data: result.data }
```

## Schema Composition

- Use `.extend()` to add fields
- Use `.pick()` / `.omit()` for partial schemas
- Use `.merge()` to combine schemas
- Use `.partial()` for optional fields

```ts
const createUserSchema = userSchema.omit({ id: true })
const updateUserSchema = userSchema.partial().required({ id: true })
```

## Common Patterns

```ts
// Enums
const statusSchema = z.enum(['active', 'inactive', 'pending'])

// Arrays with constraints
const tagsSchema = z.array(z.string()).min(1).max(10)

// Optional with default
const limitSchema = z.number().int().positive().default(10)

// Transform
const trimmedString = z.string().transform(s => s.trim())

// Refinements
const passwordSchema = z.string()
  .min(8)
  .refine(p => /[A-Z]/.test(p), 'Must contain uppercase')
  .refine(p => /[0-9]/.test(p), 'Must contain number')
```

## When Zod vs When Interface

| Boundary | Use | Why |
|----------|-----|-----|
| External API responses | Zod schema + `z.infer` | Runtime data is untrusted — `safeParse` catches shape mismatches |
| Internal service-to-service | Zod schema + `z.infer` | System boundary — validate at entry |
| Internal module types (no I/O) | `interface` / `type` | No runtime data to validate, TS compiler is enough |
| Request input (forms, params) | Zod schema + `z.infer` | User input is untrusted |

- Derive types from schemas (`z.infer`), never duplicate as separate interfaces
- External API fields: default to `.optional().default(fallback)` unless field is essential (id, name). External APIs return unpredictable shapes — strict schemas silently break as 502s

## Serialization Boundary (TanStack Start)

Zod types that cross server→client boundary via `createServerFn` get JSON-serialized. TanStack Start maps `unknown` → `{}` internally, causing type incompatibility.

- **Never** use `z.unknown()` in schemas consumed by server functions
- Use `z.json()` for arbitrary JSON blobs (produces `JsonValue` — fully serializable)
- Use `z.string().datetime()` or `z.coerce.date()` for dates (JSON serializes `Date` as ISO string)

```ts
// Bad — breaks createServerFn return type
rawResponse: z.unknown()

// Good — JsonValue is serialization-safe
rawResponse: z.json().nullable()
```

## Integration with Drizzle

- Create separate Zod schemas for validation (don't derive from Drizzle)
- Use Zod for input validation, Drizzle types for DB operations
- Keep schemas in sync manually or via codegen
