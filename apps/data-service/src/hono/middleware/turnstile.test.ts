import { Hono } from "hono";
import { type TurnstileVerifier, turnstileGuard } from "./turnstile";

function buildApp(env: Record<string, string | undefined>, verifier?: TurnstileVerifier) {
	const app = new Hono<{ Bindings: Env }>();
	app.use("/resolve", turnstileGuard(verifier ? { verifier } : {}));
	app.post("/resolve", (c) => c.json({ ok: true }));
	return (headers?: Record<string, string>) =>
		app.request("/resolve", { method: "POST", headers }, env as unknown as Env);
}

describe("turnstileGuard", () => {
	it("allows requests in dev when no secret is configured (fixture mode)", async () => {
		const request = buildApp({ CLOUDFLARE_ENV: "dev" });
		expect((await request()).status).toBe(200);
	});

	it.each([
		"staging",
		"production",
	])("fails closed in %s when no secret is configured", async (cfEnv) => {
		const request = buildApp({ CLOUDFLARE_ENV: cfEnv });
		const response = await request();
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ status: "captcha_required" });
	});

	it("rejects a live request that is missing the captcha header", async () => {
		const request = buildApp({ CLOUDFLARE_ENV: "production", TURNSTILE_SECRET_KEY: "secret" });
		const response = await request();
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ status: "captcha_required" });
	});

	it("passes when the injected verifier accepts the token", async () => {
		const verifier = vi.fn(async () => true);
		const request = buildApp(
			{ CLOUDFLARE_ENV: "production", TURNSTILE_SECRET_KEY: "secret" },
			verifier,
		);
		const response = await request({ "x-captcha-response": "tok", "CF-Connecting-IP": "1.2.3.4" });
		expect(response.status).toBe(200);
		expect(verifier).toHaveBeenCalledWith("tok", "1.2.3.4");
	});

	it("rejects when the injected verifier refuses the token", async () => {
		const request = buildApp(
			{ CLOUDFLARE_ENV: "production", TURNSTILE_SECRET_KEY: "secret" },
			async () => false,
		);
		const response = await request({ "x-captcha-response": "tok" });
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ status: "captcha_failed" });
	});
});
