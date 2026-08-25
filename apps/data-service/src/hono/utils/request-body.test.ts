import { FlightLookupRequestSchema } from "@repo/data-ops/flight";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { onErrorHandler } from "../middleware/error-handler";
import { parseJsonBody, type UnparsableBody } from "./request-body";

const REJECTION = { code: "TEST_INVALID", error: "Popraw dane." } as const;
const JSON_HEADERS = { "content-type": "application/json" };
const VALID = { flightNumber: "FR1234", departureLocalDate: "2026-09-14" };
const MISSING_STRING = ["Invalid input: expected string, received undefined"];

function app(whenUnparsable: UnparsableBody) {
	const routes = new Hono();
	routes.onError(onErrorHandler);
	routes.post("/", async (c) => {
		const body = await parseJsonBody(c, FlightLookupRequestSchema, whenUnparsable);
		if (!body.ok) {
			return c.json({ ...REJECTION, fieldErrors: body.error.flatten().fieldErrors }, 400);
		}
		return c.json({ ok: true, data: body.data });
	});
	return routes;
}

async function post(whenUnparsable: UnparsableBody, init: RequestInit) {
	const response = await app(whenUnparsable).request("/", { method: "POST", ...init });
	return { status: response.status, body: await response.json() };
}

describe("parseJsonBody", () => {
	it("hands an unparsable body to the schema as the caller's chosen stand-in", async () => {
		// The two stand-ins are not interchangeable — this difference is the whole
		// reason the value stays a required argument instead of one hardcoded default.
		for (const body of ["{", ""]) {
			expect(await post({}, { headers: JSON_HEADERS, body })).toEqual({
				status: 400,
				body: {
					...REJECTION,
					fieldErrors: { flightNumber: MISSING_STRING, departureLocalDate: MISSING_STRING },
				},
			});
			expect(await post(undefined, { headers: JSON_HEADERS, body })).toEqual({
				status: 400,
				body: { ...REJECTION, fieldErrors: {} },
			});
		}
	});

	it("passes a parsable non-object body straight through to the schema", async () => {
		// `null` and `42` are valid JSON, so the stand-in never applies and both
		// families answer identically — the schema's own top-level type error.
		for (const body of ["null", "42"]) {
			for (const whenUnparsable of [{}, undefined] as const) {
				expect(await post(whenUnparsable, { headers: JSON_HEADERS, body })).toEqual({
					status: 400,
					body: { ...REJECTION, fieldErrors: {} },
				});
			}
		}
	});

	it("accepts a valid body with or without a JSON content-type header", async () => {
		for (const headers of [JSON_HEADERS, {}]) {
			expect(await post(undefined, { headers, body: JSON.stringify(VALID) })).toEqual({
				status: 200,
				body: { ok: true, data: VALID },
			});
		}
	});

	it("rejects a well-formed body that fails the schema", async () => {
		const body = JSON.stringify({ flightNumber: "FR1234" });
		expect(await post(undefined, { headers: JSON_HEADERS, body })).toEqual({
			status: 400,
			body: { ...REJECTION, fieldErrors: { departureLocalDate: MISSING_STRING } },
		});
	});
});

/**
 * The measurement behind issue #47's no-go on `@hono/zod-validator`, which wraps
 * `hono/validator` — so these are the behaviors any conversion would inherit. Should
 * a future Hono release let the hook see a malformed body and stop discarding a body
 * that carries no JSON content-type, this test fails, and the decision recorded in
 * `.claude/rules/data-service/hono.md` is due for a rerun.
 */
describe("hono's own json validator, measured", () => {
	async function probe(init: RequestInit) {
		const routes = new Hono();
		routes.onError(onErrorHandler);
		let hookRan = false;
		routes.post(
			"/",
			validator("json", (value, c) => {
				hookRan = true;
				const parsed = FlightLookupRequestSchema.safeParse(value);
				return parsed.success ? parsed.data : c.json(REJECTION, 400);
			}),
			(c) => c.json({ ok: true, data: c.req.valid("json") }),
		);
		const response = await routes.request("/", { method: "POST", ...init });
		return { status: response.status, hookRan, body: await response.text() };
	}

	it("answers a malformed or empty body itself, in English, without running the hook", async () => {
		for (const body of ["{", ""]) {
			expect(await probe({ headers: JSON_HEADERS, body })).toEqual({
				status: 400,
				hookRan: false,
				body: "Malformed JSON in request body",
			});
		}
	});

	it("discards a valid body that arrives without a JSON content-type", async () => {
		expect(await probe({ body: JSON.stringify(VALID) })).toEqual({
			status: 400,
			hookRan: true,
			body: JSON.stringify(REJECTION),
		});
	});

	it("passes a valid body carrying a JSON content-type", async () => {
		expect(await probe({ headers: JSON_HEADERS, body: JSON.stringify(VALID) })).toEqual({
			status: 200,
			hookRan: true,
			body: JSON.stringify({ ok: true, data: VALID }),
		});
	});
});
