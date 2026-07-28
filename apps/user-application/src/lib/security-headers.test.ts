import { describe, expect, it } from "vitest";
import { applySecurityHeaders } from "./security-headers";

describe("applySecurityHeaders", () => {
	it("adds X-Content-Type-Options: nosniff", () => {
		const res = applySecurityHeaders(new Response("ok"));
		expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
	});

	it("adds HSTS with 1-year max-age and includeSubDomains", () => {
		const res = applySecurityHeaders(new Response("ok"));
		expect(res.headers.get("Strict-Transport-Security")).toBe(
			"max-age=31536000; includeSubDomains",
		);
	});

	it("adds Referrer-Policy: strict-origin-when-cross-origin", () => {
		const res = applySecurityHeaders(new Response("ok"));
		expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
	});

	it("adds X-Frame-Options: DENY", () => {
		const res = applySecurityHeaders(new Response("ok"));
		expect(res.headers.get("X-Frame-Options")).toBe("DENY");
	});

	it("disables camera, microphone, geolocation via Permissions-Policy", () => {
		const res = applySecurityHeaders(new Response("ok"));
		const policy = res.headers.get("Permissions-Policy");
		expect(policy).toContain("camera=()");
		expect(policy).toContain("microphone=()");
		expect(policy).toContain("geolocation=()");
	});

	it("sets a CSP that allows TanStack Start hydration (inline scripts) and forbids framing", () => {
		const res = applySecurityHeaders(new Response("<html></html>"));
		const csp = res.headers.get("Content-Security-Policy");
		expect(csp).toContain("default-src 'self'");
		expect(csp).toMatch(/script-src [^;]*'unsafe-inline'/);
		expect(csp).toMatch(/style-src [^;]*'unsafe-inline'/);
		expect(csp).toContain("frame-ancestors 'none'");
	});

	it("allowlists Cloudflare Turnstile in script-src and frame-src", () => {
		const res = applySecurityHeaders(new Response("<html></html>"));
		const csp = res.headers.get("Content-Security-Policy");
		expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
		expect(csp).toMatch(/frame-src [^;]*https:\/\/challenges\.cloudflare\.com/);
	});

	it("allows the local data-service HTTP and WebSocket origins in connect-src", () => {
		const res = applySecurityHeaders(new Response("<html></html>"), "http://localhost:8788");
		const csp = res.headers.get("Content-Security-Policy");
		const connectSrc = csp?.split("; ").find((directive) => directive.startsWith("connect-src"));

		// ws:/wss: are distinct CSP schemes from http:/https:, so the Flight Room
		// socket origin must be listed alongside the REST origin.
		expect(connectSrc).toBe("connect-src 'self' https: http://localhost:8788 ws://localhost:8788");
		expect(connectSrc?.split(" ")).not.toContain("http:");
	});

	it("adds the wss: origin for an https data-service (staging/production)", () => {
		const res = applySecurityHeaders(new Response("<html></html>"), "https://api.example.com");
		const csp = res.headers.get("Content-Security-Policy");
		const connectSrc = csp?.split("; ").find((directive) => directive.startsWith("connect-src"));

		expect(connectSrc).toBe(
			"connect-src 'self' https: https://api.example.com wss://api.example.com",
		);
	});

	it.each([
		"http://localhost:8788",
		"https://api.example.com",
		"https://api-staging.landingos.app",
	])("never lists an http(s) data-service origin without its ws(s) counterpart (%s)", (dataServiceUrl) => {
		const res = applySecurityHeaders(new Response("<html></html>"), dataServiceUrl);
		const csp = res.headers.get("Content-Security-Policy");
		const connectSrc = csp?.split("; ").find((directive) => directive.startsWith("connect-src"));
		const sources = connectSrc?.split(" ") ?? [];

		// Any concrete http(s):// origin (not the bare `https:` scheme token) must be
		// accompanied by its ws(s):// equivalent, or browsers block the Flight Room
		// socket while REST still works — the "messages only on refresh" bug.
		for (const source of sources) {
			if (source === "https:" || !/^https?:\/\//.test(source)) continue;
			const socketOrigin = source.replace(/^http/, "ws");
			expect(sources).toContain(socketOrigin);
		}
	});

	it("preserves original status, body, and existing response headers", async () => {
		const original = new Response("<html>hi</html>", {
			status: 201,
			headers: { "Content-Type": "text/html; charset=utf-8", "X-Custom": "kept" },
		});
		const res = applySecurityHeaders(original);

		expect(res.status).toBe(201);
		expect(await res.text()).toBe("<html>hi</html>");
		expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
		expect(res.headers.get("X-Custom")).toBe("kept");
	});
});
