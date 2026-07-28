// Cloudflare Turnstile loads its script and renders its challenge inside an
// iframe from this origin, so it must be allowlisted in script-src + frame-src.
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

const connectSources = (dataServiceUrl?: string): string[] => {
	const sources = ["'self'", "https:"];
	if (!dataServiceUrl) return sources;

	try {
		const url = new URL(dataServiceUrl);
		if (url.protocol === "http:" || url.protocol === "https:") {
			// The Flight Room chat opens a WebSocket to the same origin. CSP treats
			// ws:/wss: as distinct schemes from http:/https:, so the HTTP origin alone
			// does not authorize the socket — the ws(s): origin must be listed too, or
			// the browser blocks the connection and realtime messages never arrive.
			const socketOrigin = url.origin.replace(/^http/, "ws");
			for (const source of [url.origin, socketOrigin]) {
				if (!sources.includes(source)) sources.push(source);
			}
		}
	} catch {
		// Keep the restrictive default when configuration is invalid.
	}

	return sources;
};

export const applySecurityHeaders = (response: Response, dataServiceUrl?: string): Response => {
	const headers = new Headers(response.headers);
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
	headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
	headers.set("X-Frame-Options", "DENY");
	headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
	headers.set(
		"Content-Security-Policy",
		[
			"default-src 'self'",
			`script-src 'self' 'unsafe-inline' 'unsafe-eval' ${TURNSTILE_ORIGIN}`,
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data: https:",
			"font-src 'self' data:",
			`connect-src ${connectSources(dataServiceUrl).join(" ")}`,
			`frame-src 'self' ${TURNSTILE_ORIGIN}`,
			"frame-ancestors 'none'",
			"base-uri 'self'",
			"form-action 'self'",
		].join("; "),
	);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};
