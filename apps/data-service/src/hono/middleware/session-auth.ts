import type { MiddlewareHandler } from "hono";
import { UNAUTHORIZED_BODY } from "../utils/api-errors";

export type GetSession = (req: Request) => Promise<unknown | null>;

export interface SessionAuthOptions {
	bearer: string;
	getSession: GetSession;
}

const BEARER_PREFIX = "Bearer ";

export const sessionAuth = (opts: SessionAuthOptions): MiddlewareHandler<{ Bindings: Env }> => {
	return async (c, next) => {
		const header = c.req.header("Authorization");
		if (header?.startsWith(BEARER_PREFIX) && header.slice(BEARER_PREFIX.length) === opts.bearer) {
			return next();
		}
		let session: unknown = null;
		try {
			session = await opts.getSession(c.req.raw);
		} catch {
			session = null;
		}
		if (session) {
			return next();
		}
		return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
	};
};

/**
 * The session shape every authenticated family reads — the only thing the API needs
 * from Better Auth is who the caller is.
 */
export interface UserSession {
	user?: { id?: string | null } | null;
}

export type GetUserSession = (request: Request) => Promise<UserSession | null>;

/** Published by `requireUser` so a route never re-reads the session it is behind. */
export interface UserVariables {
	userId: string;
}

/**
 * Reads the caller id, treating an auth-subsystem failure as "no caller". The single
 * implementation behind both `requireUser` and the bespoke WebSocket upgrade branch,
 * which must decide on tickets before any session is touched.
 */
export async function sessionUserId(
	getSession: GetUserSession,
	request: Request,
): Promise<string | null> {
	try {
		return (await getSession(request))?.user?.id ?? null;
	} catch {
		return null;
	}
}

/**
 * Decides "who is the caller" once per request and publishes it to the route. Mounted
 * per router so handlers receive an id instead of repeating the session preamble.
 */
export function requireUser(options: {
	getSession: GetUserSession;
}): MiddlewareHandler<{ Bindings: Env; Variables: UserVariables }> {
	return async (c, next) => {
		const userId = await sessionUserId(options.getSession, c.req.raw);
		if (!userId) {
			return c.json(UNAUTHORIZED_BODY, 401);
		}
		c.set("userId", userId);
		await next();
	};
}
