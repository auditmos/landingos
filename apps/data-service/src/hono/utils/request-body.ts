import type { Context } from "hono";

/**
 * The slice of a Zod error the handlers actually read. Typed structurally because
 * `zod` is a `@repo/data-ops` dependency, not a data-service one — schemas always
 * arrive already built, from a named domain barrel.
 */
export interface BodyError {
	readonly issues: readonly { readonly path: PropertyKey[]; readonly message: string }[];
	flatten(): { fieldErrors: Record<string, string[] | undefined> };
}

interface BodySchema<T> {
	safeParse(value: unknown): { success: true; data: T } | { success: false; error: BodyError };
}

/**
 * What an unparsable request body — malformed JSON, an empty body, a body sent with
 * no `Content-Type` — is handed to the schema as. The two blessed values are not
 * interchangeable: each is what makes its own family's 400 body correct.
 *
 * - `{}` for families whose rejection lists per-field errors. Every required field
 *   then reports its own issue; `undefined` would collapse them into one top-level
 *   form error and ship `fieldErrors: {}` to a frontend that renders per field.
 * - `undefined` for families whose rejection is one fixed `{ code, error }`. Only
 *   success-or-failure is read, so the cheaper value is also the honest one.
 *
 * `operator-catalog`'s `POST /:id/publish` is the documented exception and still
 * reads its body by hand: it must tell an absent body (publish the saved draft)
 * apart from an empty object, which neither value preserves.
 */
export type UnparsableBody = Record<string, never> | undefined;

export type JsonBody<T> = { ok: true; data: T } | { ok: false; error: BodyError };

/**
 * The one JSON-body read in the API: take the body, fall back to `whenUnparsable` if
 * it will not parse, validate against a named `data-ops` schema. Callers get a
 * discriminated result and never see a thrown parse error.
 *
 * Hono's own `validator("json", …)` — which `@hono/zod-validator` wraps — cannot
 * stand in here: it throws `HTTPException(400, "Malformed JSON in request body")`
 * *before* its validation hook runs, so a malformed body would answer with that
 * English string instead of the family's Polish rejection, and it discards a valid
 * body that arrives without a JSON `Content-Type`. `request-body.test.ts` pins both.
 */
export async function parseJsonBody<T>(
	c: Context,
	schema: BodySchema<T>,
	whenUnparsable: UnparsableBody,
): Promise<JsonBody<T>> {
	const parsed = schema.safeParse(await c.req.json().catch(() => whenUnparsable));
	return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: parsed.error };
}
