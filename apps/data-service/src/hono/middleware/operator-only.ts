import type { MiddlewareHandler } from "hono";
import { UNAUTHORIZED_BODY } from "../utils/api-errors";
import type { UserSession } from "./session-auth";

export type OperatorSession = UserSession;

export interface OperatorOnlyOptions {
	getSession(request: Request): Promise<OperatorSession | null>;
	getUserRole(userId: string): Promise<"operator" | "user" | null>;
}

/**
 * Published to the routes behind the gate so an audited mutation can record who
 * made it without re-reading the session.
 */
export interface OperatorVariables {
	operatorUserId: string;
}

export function operatorOnly(
	options: OperatorOnlyOptions,
): MiddlewareHandler<{ Bindings: Env; Variables: OperatorVariables }> {
	return async (c, next) => {
		let session: OperatorSession | null = null;
		try {
			session = await options.getSession(c.req.raw);
		} catch {
			return c.json(UNAUTHORIZED_BODY, 401);
		}
		const userId = session?.user?.id;
		if (!userId) {
			return c.json(UNAUTHORIZED_BODY, 401);
		}
		try {
			const role = await options.getUserRole(userId);
			if (role !== "operator") {
				return c.json({ code: "FORBIDDEN", error: "Brak uprawnień operatora." }, 403);
			}
		} catch {
			return c.json({ code: "UNAUTHORIZED", error: "Nie udało się potwierdzić uprawnień." }, 401);
		}
		c.set("operatorUserId", userId);
		await next();
	};
}
