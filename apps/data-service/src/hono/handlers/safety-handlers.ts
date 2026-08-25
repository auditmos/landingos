import { getAuth } from "@repo/data-ops/auth/server";
import { PseudonymSchema } from "@repo/data-ops/identity";
import { RoomIdSchema } from "@repo/data-ops/room";
import {
	CommunityRulesAcceptanceRequestSchema,
	RoomBlockRequestSchema,
	SafetyReportCreateRequestSchema,
} from "@repo/data-ops/safety";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { createDatabaseSafetyService } from "../../safety/repository";
import { type SafetyService, SafetyServiceError } from "../../safety/service";
import { rateLimiter } from "../middleware/rate-limiter";
import {
	type GetUserSession,
	requireUser,
	type UserSession,
	type UserVariables,
} from "../middleware/session-auth";
import { invalidRoomId, serviceErrorResponder } from "../utils/api-errors";

export interface SafetyHandlerDependencies {
	createService(env: Env): SafetyService;
	getSession: GetUserSession;
}

const defaultDependencies: SafetyHandlerDependencies = {
	createService: createDatabaseSafetyService,
	getSession: async (request) =>
		(await getAuth().api.getSession({ headers: request.headers })) as UserSession,
};

const defaultMutationLimiter = rateLimiter({
	binding: "RATE_LIMITER",
	limit: 10,
	window: 60,
	errorCode: "safety_rate_limited",
	errorMessage: "Zbyt wiele operacji bezpieczeństwa. Spróbuj ponownie za 60 sekund.",
});

const serviceError = serviceErrorResponder(SafetyServiceError);

export function createSafetyHandlers(
	dependencies: SafetyHandlerDependencies = defaultDependencies,
	mutationLimiter: MiddlewareHandler = defaultMutationLimiter,
) {
	const safety = new Hono<{ Bindings: Env; Variables: UserVariables }>();
	const authenticated = requireUser({ getSession: dependencies.getSession });

	safety.get("/rules", authenticated, async (c) => {
		return c.json(await dependencies.createService(c.env).getRulesStatus(c.get("userId")));
	});

	safety.post("/rules/accept", authenticated, async (c) => {
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
			return c.json(
				await dependencies.createService(c.env).acceptRules(c.get("userId"), parsed.data),
			);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	safety.get("/rooms/:roomId/blocks", authenticated, async (c) => {
		const parsedRoomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!parsedRoomId.success) return invalidRoomId(c);
		try {
			return c.json(
				await dependencies.createService(c.env).listBlocks(c.get("userId"), parsedRoomId.data),
			);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	safety.put("/rooms/:roomId/blocks", authenticated, mutationLimiter, async (c) => {
		const parsedRoomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!parsedRoomId.success) return invalidRoomId(c);
		const parsed = RoomBlockRequestSchema.safeParse(await c.req.json().catch(() => undefined));
		if (!parsed.success) {
			return c.json({ code: "safety_request_invalid", error: "Wskaż prawidłowy pseudonim." }, 400);
		}
		try {
			return c.json(
				await dependencies
					.createService(c.env)
					.block(c.get("userId"), parsedRoomId.data, parsed.data),
			);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	safety.delete(
		"/rooms/:roomId/blocks/:targetPseudonym",
		authenticated,
		mutationLimiter,
		async (c) => {
			const parsedRoomId = RoomIdSchema.safeParse(c.req.param("roomId"));
			if (!parsedRoomId.success) return invalidRoomId(c);
			const pseudonym = PseudonymSchema.safeParse(c.req.param("targetPseudonym"));
			if (!pseudonym.success) {
				return c.json(
					{ code: "safety_request_invalid", error: "Wskaż prawidłowy pseudonim." },
					400,
				);
			}
			try {
				return c.json(
					await dependencies
						.createService(c.env)
						.unblock(c.get("userId"), parsedRoomId.data, pseudonym.data),
				);
			} catch (error) {
				return serviceError(c, error);
			}
		},
	);

	safety.post("/rooms/:roomId/reports", authenticated, mutationLimiter, async (c) => {
		const parsedRoomId = RoomIdSchema.safeParse(c.req.param("roomId"));
		if (!parsedRoomId.success) return invalidRoomId(c);
		const parsed = SafetyReportCreateRequestSchema.safeParse(
			await c.req.json().catch(() => undefined),
		);
		if (!parsed.success) {
			return c.json({ code: "safety_request_invalid", error: "Sprawdź dane zgłoszenia." }, 400);
		}
		try {
			const result = await dependencies
				.createService(c.env)
				.report(c.get("userId"), parsedRoomId.data, parsed.data);
			return c.json(result, result.created ? 201 : 200);
		} catch (error) {
			return serviceError(c, error);
		}
	});

	return safety;
}

export default createSafetyHandlers();
