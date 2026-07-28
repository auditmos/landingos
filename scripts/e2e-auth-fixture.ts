import type { IncomingMessage, ServerResponse } from "node:http";
import type { FixtureStore, FixtureUser } from "./e2e-fixture-store.ts";
import { readJsonBody as body, sendJson as json } from "./e2e-http.ts";

export function authenticateFixtureRequest(store: FixtureStore, request: IncomingMessage) {
	const authorization = request.headers.authorization;
	if (authorization?.startsWith("Bearer ")) {
		return store.userByToken(authorization.slice("Bearer ".length));
	}
	return store.userByCookie(request.headers.cookie);
}

function publicSession(user: FixtureUser) {
	return {
		user: { id: user.id, email: user.email, name: user.pseudonym, image: null, role: user.role },
		session: { token: user.token },
	};
}

function sessionCookie(user: FixtureUser) {
	return `landingos_e2e_session=${encodeURIComponent(user.token)}; Path=/; HttpOnly; SameSite=Lax`;
}

const CLEARED_SESSION_COOKIE = "landingos_e2e_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is a compact route matrix for the isolated fake auth boundary.
export async function handleAuthFixtureRequest(
	store: FixtureStore,
	request: IncomingMessage,
	response: ServerResponse,
	url: URL,
): Promise<boolean> {
	if (
		(url.pathname === "/test-auth/request" ||
			url.pathname === "/api/auth/email-otp/send-verification-otp") &&
		request.method === "POST"
	) {
		const input = await body(request);
		store.requestOtp(
			String(input.email ?? "")
				.trim()
				.toLowerCase(),
		);
		json(response, 200, url.pathname === "/test-auth/request" ? { sent: true } : { success: true });
		return true;
	}

	if (
		(url.pathname === "/test-auth/verify" || url.pathname === "/api/auth/sign-in/email-otp") &&
		request.method === "POST"
	) {
		const input = await body(request);
		const user = store.verifyOtp(
			String(input.email ?? "")
				.trim()
				.toLowerCase(),
			String(input.otp ?? ""),
		);
		if (!user) {
			json(
				response,
				401,
				url.pathname === "/test-auth/verify"
					? { error: "invalid_otp" }
					: { code: "INVALID_OTP", message: "Invalid or expired OTP" },
			);
			return true;
		}
		json(
			response,
			200,
			url.pathname === "/test-auth/verify"
				? { token: user.token, ...publicSession(user) }
				: { token: user.token, user: publicSession(user).user },
			{ "set-cookie": sessionCookie(user) },
		);
		return true;
	}

	if (url.pathname === "/test-auth/session" || url.pathname === "/api/auth/get-session") {
		const user = authenticateFixtureRequest(store, request);
		json(response, 200, user ? publicSession(user) : null);
		return true;
	}

	if (
		(url.pathname === "/test-auth/signout" || url.pathname === "/api/auth/sign-out") &&
		request.method === "POST"
	) {
		json(
			response,
			200,
			url.pathname === "/test-auth/signout" ? { signedOut: true } : { success: true },
			{ "set-cookie": CLEARED_SESSION_COOKIE },
		);
		return true;
	}

	return false;
}
