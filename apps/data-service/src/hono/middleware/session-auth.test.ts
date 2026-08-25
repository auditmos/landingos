import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
	type GetSession,
	type GetUserSession,
	requireUser,
	sessionAuth,
	type UserVariables,
} from "./session-auth";

const BEARER = "test-bearer-1234";

const noSession: GetSession = async () => null;

function buildApp(getSession: GetSession = noSession) {
	const app = new Hono<{ Bindings: Env }>();
	app.use("/protected", sessionAuth({ bearer: BEARER, getSession }));
	app.get("/protected", (c) => c.text("ok"));
	return app;
}

describe("sessionAuth middleware", () => {
	it("rejects requests with no Authorization header and no session", async () => {
		const app = buildApp();
		const res = await app.fetch(new Request("http://localhost/protected"));
		expect(res.status).toBe(401);
	});

	it("allows requests bearing the configured token", async () => {
		const app = buildApp();
		const res = await app.fetch(
			new Request("http://localhost/protected", {
				headers: { Authorization: `Bearer ${BEARER}` },
			}),
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
	});

	it("rejects requests bearing a wrong token", async () => {
		const app = buildApp();
		const res = await app.fetch(
			new Request("http://localhost/protected", {
				headers: { Authorization: "Bearer wrong-token" },
			}),
		);
		expect(res.status).toBe(401);
	});

	it("allows requests carrying a valid Better Auth session cookie", async () => {
		const sessionFromCookie: GetSession = async (req) =>
			req.headers.get("cookie")?.includes("better-auth.session_token=valid")
				? { user: { id: "u1", email: "a@b.com" } }
				: null;
		const app = buildApp(sessionFromCookie);
		const res = await app.fetch(
			new Request("http://localhost/protected", {
				headers: { cookie: "better-auth.session_token=valid" },
			}),
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
	});

	it("rejects requests when getSession returns null", async () => {
		const app = buildApp(noSession);
		const res = await app.fetch(
			new Request("http://localhost/protected", {
				headers: { cookie: "better-auth.session_token=expired" },
			}),
		);
		expect(res.status).toBe(401);
	});

	it("rejects requests when getSession throws (auth subsystem error)", async () => {
		const throwingSession: GetSession = async () => {
			throw new Error("Auth not initialized");
		};
		const app = buildApp(throwingSession);
		const res = await app.fetch(new Request("http://localhost/protected"));
		expect(res.status).toBe(401);
	});
});

function buildUserApp(getSession: GetUserSession) {
	const app = new Hono<{ Bindings: Env; Variables: UserVariables }>();
	app.use("/me", requireUser({ getSession }));
	app.get("/me", (c) => c.json({ userId: c.get("userId") }));
	return app;
}

describe("requireUser middleware", () => {
	it("rejects a request with no session in Polish, on the shared wire code", async () => {
		const app = buildUserApp(async () => null);
		const res = await app.fetch(new Request("http://localhost/me"));
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({
			code: "UNAUTHORIZED",
			error: "Wymagane jest zalogowanie.",
		});
	});

	it("rejects a session without a user id", async () => {
		const app = buildUserApp(async () => ({ user: { id: null } }));
		expect((await app.fetch(new Request("http://localhost/me"))).status).toBe(401);
	});

	it("rejects when the auth subsystem throws", async () => {
		const app = buildUserApp(async () => {
			throw new Error("Auth not initialized");
		});
		expect((await app.fetch(new Request("http://localhost/me"))).status).toBe(401);
	});

	it("publishes the caller id to the route so handlers never re-read the session", async () => {
		const getSession = vi.fn<GetUserSession>(async () => ({ user: { id: "user-1" } }));
		const app = buildUserApp(getSession);
		const res = await app.fetch(new Request("http://localhost/me"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ userId: "user-1" });
		expect(getSession).toHaveBeenCalledOnce();
	});
});
