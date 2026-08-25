import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { App } from "./app";

/*
 * Regression assumptions:
 * - input: an anonymous request to the starter client CRUD surface;
 * - output: 404 — the route is not mounted on the Worker at all;
 * - boundary: the starter domain stored name, surname, and email and its read
 *   routes were anonymous, so an unmounted route is the control, not auth;
 * - out of scope: the product routes mounted alongside it, which keep their own
 *   handler-level tests.
 */
describe("Worker route surface", () => {
	it.each([
		"/clients",
		"/clients/018f4c8e-5697-7df4-8f6e-c7644b137e5b",
	])("does not mount the starter client PII surface at %s", async (path) => {
		const response = await App.fetch(new Request(`http://localhost${path}`), env);

		expect(response.status).toBe(404);
	});

	it("still mounts the product routes", async () => {
		const response = await App.fetch(new Request("http://localhost/health/live"), env);

		expect(response.status).toBe(200);
	});
});
