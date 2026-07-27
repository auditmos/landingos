import { Hono } from "hono";
import { type OperatorSession, operatorOnly } from "./operator-only";

function buildApp() {
	const getSession = vi.fn(async (request: Request): Promise<OperatorSession | null> => {
		const cookie = request.headers.get("cookie");
		const bearer = request.headers.get("authorization");
		if (cookie === "better-auth.session_token=operator-cookie") return { user: { id: "operator" } };
		if (cookie === "better-auth.session_token=user-cookie") return { user: { id: "user" } };
		if (bearer === "Bearer operator-session") return { user: { id: "operator" } };
		if (bearer === "Bearer user-session") return { user: { id: "user" } };
		return null;
	});
	const getUserRole = vi.fn(async (userId: string) =>
		userId === "operator" ? "operator" : "user",
	);
	const app = new Hono();
	app.use("/catalog", operatorOnly({ getSession, getUserRole }));
	app.get("/catalog", (c) => c.json({ ok: true }));
	return { app, getSession, getUserRole };
}

describe("operatorOnly middleware", () => {
	it.each([
		[{}, 401],
		[{ cookie: "better-auth.session_token=user-cookie" }, 403],
		[{ authorization: "Bearer user-session" }, 403],
		[{ authorization: "Bearer configured-api-token" }, 401],
		[{ cookie: "better-auth.session_token=operator-cookie" }, 200],
		[{ authorization: "Bearer operator-session" }, 200],
	])("applies authoritative role checks for raw headers %j", async (headers, status) => {
		const { app } = buildApp();
		const response = await app.request("/catalog", { headers });
		expect(response.status).toBe(status);
	});

	it("fails closed when session or role lookup throws", async () => {
		for (const dependency of ["session", "role"] as const) {
			const app = new Hono();
			app.use(
				"/catalog",
				operatorOnly({
					getSession: async () => {
						if (dependency === "session") throw new Error("auth unavailable");
						return { user: { id: "operator" } };
					},
					getUserRole: async () => {
						throw new Error("db unavailable");
					},
				}),
			);
			app.get("/catalog", (c) => c.text("unsafe"));
			expect((await app.request("/catalog")).status).toBe(401);
		}
	});
});
