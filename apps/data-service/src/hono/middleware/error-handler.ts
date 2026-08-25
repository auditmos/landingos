import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

// The single last-resort body. Anything reaching here is by definition unexpected,
// so the client learns only the correlation id: a DrizzleQueryError's `message` is
// "Failed query: <SQL>\nparams: <values>", and echoing it would ship raw SQL and
// bound parameters to clients in staging and production.
//
// Deliberately logs nothing. Those same bound parameters can carry the private
// destination, an email, or a message body, which the S8 privacy invariant bars
// from logs just as firmly as from responses — `scripts/lifecycle-privacy-
// boundary.test.ts` enforces that this file stays free of console calls. The
// request id is the correlation handle instead.
const GENERIC_ERROR = "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.";

export async function onErrorHandler(err: unknown, c: Context) {
	const requestId = c.get("requestId") || "unknown";

	// Framework defense only: nothing in this app throws HTTPException, but Hono
	// internals do (e.g. payload limits), and their own response already carries
	// the correct status and a safe body.
	if (err instanceof HTTPException) {
		const response = err.getResponse();
		response.headers.set("x-request-id", requestId);
		return response;
	}

	c.header("x-request-id", requestId);
	return c.json({ error: GENERIC_ERROR, requestId }, 500);
}
