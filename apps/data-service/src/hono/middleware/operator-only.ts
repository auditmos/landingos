import type { MiddlewareHandler } from "hono";

export interface OperatorSession {
	user?: { id?: string | null } | null;
}

export interface OperatorOnlyOptions {
	getSession(request: Request): Promise<OperatorSession | null>;
	getUserRole(userId: string): Promise<"operator" | "user" | null>;
}

export function operatorOnly(options: OperatorOnlyOptions): MiddlewareHandler {
	return async (c, next) => {
		let session: OperatorSession | null = null;
		try {
			session = await options.getSession(c.req.raw);
		} catch {
			return c.json({ code: "UNAUTHORIZED", error: "Wymagane jest zalogowanie." }, 401);
		}
		const userId = session?.user?.id;
		if (!userId) {
			return c.json({ code: "UNAUTHORIZED", error: "Wymagane jest zalogowanie." }, 401);
		}
		try {
			const role = await options.getUserRole(userId);
			if (role !== "operator") {
				return c.json({ code: "FORBIDDEN", error: "Brak uprawnień operatora." }, 403);
			}
		} catch {
			return c.json({ code: "UNAUTHORIZED", error: "Nie udało się potwierdzić uprawnień." }, 401);
		}
		await next();
	};
}
