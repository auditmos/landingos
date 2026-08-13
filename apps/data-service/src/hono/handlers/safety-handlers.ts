import { getAuth } from "@repo/data-ops/auth/server";
import { PseudonymSchema } from "@repo/data-ops/identity";
import { RoomIdSchema } from "@repo/data-ops/room";
import {
	CommunityRulesAcceptanceRequestSchema,
	RoomBlockRequestSchema,
	SafetyReportCreateRequestSchema,
} from "@repo/data-ops/safety";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { createDatabaseSafetyService } from "../../safety/repository";
import { type SafetyService, SafetyServiceError } from "../../safety/service";
import { rateLimiter } from "../middleware/rate-limiter";

interface SafetySession {
	user?: { id?: string | null } | null;
}

export interface SafetyHandlerDependencies {
	createService(env: Env): SafetyService;
	getSession(request: Request): Promise<SafetySession | null>;
}

const defaultDependencies: SafetyHandlerDependencies = {
	createService: createDatabaseSafetyService,
	getSession: async (request) =>
		(await getAuth().api.getSession({ headers: request.headers })) as SafetySession | null,
};

const defaultMutationLimiter = rateLimiter({
	binding: "RATE_LIMITER",
	limit: 10,
	window: 60,
	errorCode: "safety_rate_limited",
	errorMessage: "Zbyt wiele operacji bezpieczeństwa. Spróbuj ponownie za 60 sekund.",
});

function unauthorized(c: Context) {
	return c.json({ code: "unauthorized", error: "Wymagane jest zalogowanie." }, 401);
}

async function currentUserId(
	request: Request,
	dependencies: SafetyHandlerDependencies,
): Promise<string | null> {
	try {
		return (await dependencies.getSession(request))?.user?.id ?? null;
	} catch {
		return null;
	}
}

function serviceError(c: Context, error: unknown) {
	if (!(error instanceof SafetyServiceError)) throw error;
	return c.json({ code: error.code, error: error.message }, error.status);
}

function invalidRoom(c: Context) {
	return c.json({ code: "room_id_invalid", error: "Nieprawidłowy identyfikator pokoju." }, 400);
}

async function userOrUnauthorized(c: Context, dependencies: SafetyHandlerDependencies) {
	return currentUserId(c.req.raw, dependencies);
}

export function createSafetyHandlers(
	dependencies: SafetyHandlerDependencies = defaultDependencies,
	mutationLimiter: MiddlewareHandler = defaultMutationLimiter,
) {
	const safety = new Hono<{ Bindings: Env }>();

	safety.get("/rules", async (c) => {
		const userId = await userOrUnauthorized(c, dependencies);
		if (!userId) return unauthorized(c);
		return c.json(await dependencies.createService(c.env).getRulesStatus(userId));
	});

	safety.post("/rules/accept", async (c) => {
		const userId = await userOrUnauthorized(c, dependencies);
		if (!userId) return unauthorized(c);
		const parsed = CommunityRulesAcceptanceRequestSchema.safeParse(
			await c.req.json().catch(() => undefined),
		);
		if (!parsed.success) {
			return c.json(
				{ code: "safety_request_invalid", error: "Nieprawidłowa wersja zasad społeczności." },
				400,
			);
		}
		try {
			return c.json(await dependencies.createService(c.env).acceptRules(userId, parsed.data));
		} catch (error) {
			return serviceError(c, error);
		}
	});

	safety.get("/rooms/:roomId/blocks", async (c) => {
		const userId = await userOrUnauthorized(c, dependencies);
		if (!userId) return unauthorized(c);
		const parsedRoomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!parsedRoomId.success) return invalidRoom(c);
		try {
			return c.json(await dependencies.createService(c.env).listBlocks(userId, parsedRoomId.data));
		} catch (error) {
			return serviceError(c, error);
		}
	});

	safety.put("/rooms/:roomId/blocks", mutationLimiter, async (c) => {
		const userId = await userOrUnauthorized(c, dependencies);
		if (!userId) return unauthorized(c);
		const parsedRoomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!parsedRoomId.success) return invalidRoom(c);
		const parsed = RoomBlockRequestSchema.safeParse(await c.req.json().catch(() => undefined));
		if (!parsed.success) {
			return c.json({ code: "safety_request_invalid", error: "Wskaż prawidłowy pseudonim." }, 400);
		}
		try {
			return c.json(
				await dependencies.createService(c.env).block(userId, parsedRoomId.data, parsed.data),
			);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	safety.delete("/rooms/:roomId/blocks/:targetPseudonym", mutationLimiter, async (c) => {
		const userId = await userOrUnauthorized(c, dependencies);
		if (!userId) return unauthorized(c);
		const parsedRoomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!parsedRoomId.success) return invalidRoom(c);
		const pseudonym = PseudonymSchema.safeParse(c.req.param("targetPseudonym"));
		if (!pseudonym.success) {
			return c.json({ code: "safety_request_invalid", error: "Wskaż prawidłowy pseudonim." }, 400);
		}
		try {
			return c.json(
				await dependencies.createService(c.env).unblock(userId, parsedRoomId.data, pseudonym.data),
			);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	safety.post("/rooms/:roomId/reports", mutationLimiter, async (c) => {
		const userId = await userOrUnauthorized(c, dependencies);
		if (!userId) return unauthorized(c);
		const parsedRoomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!parsedRoomId.success) return invalidRoom(c);
		const parsed = SafetyReportCreateRequestSchema.safeParse(
			await c.req.json().catch(() => undefined),
		);
		if (!parsed.success) {
			return c.json({ code: "safety_request_invalid", error: "Sprawdź dane zgłoszenia." }, 400);
		}
		try {
			const result = await dependencies
				.createService(c.env)
				.report(userId, parsedRoomId.data, parsed.data);
			return c.json(result, result.created ? 201 : 200);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	return safety;
}

export default createSafetyHandlers();
