import type { MiddlewareHandler } from "hono";
import { runtimeVars } from "../../runtime-vars";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const CAPTCHA_HEADER = "x-captcha-response";

export type TurnstileVerifier = (token: string, remoteIp: string | null) => Promise<boolean>;

interface SiteVerifyResponse {
	success?: boolean;
}

async function siteVerify(
	secret: string,
	token: string,
	remoteIp: string | null,
	fetchImpl: typeof fetch,
): Promise<boolean> {
	const body = new URLSearchParams({ secret, response: token });
	if (remoteIp) {
		body.set("remoteip", remoteIp);
	}
	try {
		const response = await fetchImpl(SITEVERIFY_URL, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body,
		});
		if (!response.ok) {
			return false;
		}
		const data = (await response.json().catch(() => null)) as SiteVerifyResponse | null;
		return data?.success === true;
	} catch {
		return false;
	}
}

export interface TurnstileGuardOptions {
	/** Injected verifier — defaults to a live Cloudflare siteverify call. Used by tests. */
	verifier?: TurnstileVerifier;
}

/**
 * Rejects requests that fail Cloudflare Turnstile verification.
 *
 * Mode resolution mirrors the provider-neutral fixture/live contract:
 * - no secret + `CLOUDFLARE_ENV=dev` → challenge disabled (fixture/local), request passes.
 * - no secret + staging/production → fail closed (503), never silently accept bots.
 * - secret present → verify the `x-captcha-response` header; missing/invalid → 403.
 */
export function turnstileGuard(
	options: TurnstileGuardOptions = {},
): MiddlewareHandler<{ Bindings: Env }> {
	return async (c, next) => {
		const runtimeEnv = runtimeVars(c.env);
		const secret = runtimeEnv.TURNSTILE_SECRET_KEY;

		if (!secret) {
			if (runtimeEnv.CLOUDFLARE_ENV === "dev") {
				return next();
			}
			return c.json(
				{ status: "captcha_required", error: "Weryfikacja antybotowa jest niedostępna." },
				503,
			);
		}

		const token = c.req.header(CAPTCHA_HEADER);
		if (!token) {
			return c.json(
				{ status: "captcha_required", error: "Potwierdź, że nie jesteś robotem." },
				403,
			);
		}

		const verify =
			options.verifier ?? ((candidate, remoteIp) => siteVerify(secret, candidate, remoteIp, fetch));
		const passed = await verify(token, c.req.header("CF-Connecting-IP") ?? null);
		if (!passed) {
			return c.json(
				{
					status: "captcha_failed",
					error: "Weryfikacja antybotowa nie powiodła się. Spróbuj ponownie.",
				},
				403,
			);
		}
		return next();
	};
}
