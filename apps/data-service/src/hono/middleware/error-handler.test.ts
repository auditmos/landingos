import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "./error-handler";
import { requestId } from "./request-id";

const DRIZZLE_MESSAGE =
	"Failed query: SELECT * FROM auth_user WHERE email = $1\nparams: private@example.test";
const LEAK_PATTERN = /SELECT|Failed query|auth_user|params|private@example\.test/;

function buildApp(thrown: unknown) {
	const app = new Hono<{ Bindings: Env }>();
	app.use("*", requestId());
	app.onError(onErrorHandler);
	app.get("/boom", () => {
		throw thrown;
	});
	return () => app.fetch(new Request("http://localhost/boom"), {} as Env);
}

/*
 * Regression assumptions:
 * - input: anything that escapes a handler — a Drizzle failure whose `message`
 *   is "Failed query: <SQL>\nparams: <values>", or a framework HTTPException;
 * - output: a single generic Polish 500 carrying only the correlation id;
 * - boundary: no fragment of the internal message may reach the client body or
 *   the logs, because those bound parameters can be the private destination, an
 *   email, or a message body;
 * - out of scope: the live convention (AppError inside Result, unwrapped in
 *   handlers), which never reaches this last-resort boundary.
 */
describe("onErrorHandler", () => {
	it("never leaks an internal error message into the response body or the logs", async () => {
		const spies = (["debug", "error", "info", "log", "warn"] as const).map((level) =>
			vi.spyOn(console, level).mockImplementation(() => undefined),
		);
		const fetch = buildApp(new Error(DRIZZLE_MESSAGE));

		const response = await fetch();
		const raw = await response.text();

		expect(response.status).toBe(500);
		expect(raw).not.toMatch(LEAK_PATTERN);
		const body = JSON.parse(raw) as { error: string; requestId: string };
		expect(Object.keys(body).sort()).toEqual(["error", "requestId"]);
		expect(body.requestId).toMatch(/^[a-zA-Z0-9-]{1,64}$/);
		expect(response.headers.get("x-request-id")).toBe(body.requestId);
		// Polish copy rule: the last-resort body is user-facing.
		expect(body.error).toMatch(/[ąćęłńóśźż]/i);

		// S8 privacy invariant: bound parameters are barred from logs, not just
		// from responses, so this boundary stays silent.
		for (const spy of spies) {
			expect(spy).not.toHaveBeenCalled();
			spy.mockRestore();
		}
	});

	it("returns the same generic body for a non-Error throw", async () => {
		// Hono never routes a non-Error throw through onError — it propagates out
		// of fetch — so this pins the defensive branch at the unit boundary.
		const app = new Hono<{ Bindings: Env }>();
		app.use("*", requestId());
		app.get("/direct", (c) => onErrorHandler("nagły błąd tekstowy z SELECT 1", c));

		const response = await app.fetch(new Request("http://localhost/direct"), {} as Env);
		const body = (await response.json()) as { error: string; requestId: string };
		const fromError = (await (await buildApp(new Error(DRIZZLE_MESSAGE))()).json()) as {
			error: string;
		};

		expect(response.status).toBe(500);
		expect(Object.keys(body).sort()).toEqual(["error", "requestId"]);
		expect(body.error).toBe(fromError.error);
		expect(JSON.stringify(body)).not.toMatch(LEAK_PATTERN);
	});

	it("lets a framework HTTPException keep its own status", async () => {
		const fetch = buildApp(new HTTPException(413, { message: "Payload Too Large" }));

		const response = await fetch();

		expect(response.status).toBe(413);
		expect(response.headers.get("x-request-id")).toMatch(/^[a-zA-Z0-9-]{1,64}$/);
	});
});
