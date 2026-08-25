import {
	COMMUNITY_RULES_TOPICS,
	COMMUNITY_RULES_VERSION,
	type CommunityRulesStatusResponse,
} from "@repo/data-ops/safety";
import { Hono, type MiddlewareHandler } from "hono";
import { vi } from "vitest";
import type { SafetyService } from "../../safety/service";
import { SafetyServiceError } from "../../safety/service";
import { rateLimiter } from "../middleware/rate-limiter";
import { createSafetyHandlers } from "./safety-handlers";

const ROOM_ID = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";
const passThrough: MiddlewareHandler = async (_c, next) => next();

function buildApp(
	serviceOverrides: Partial<SafetyService> = {},
	mutationLimiter: MiddlewareHandler | null = passThrough,
) {
	const service: SafetyService = {
		getRulesStatus: vi.fn(async () => ({
			version: COMMUNITY_RULES_VERSION,
			accepted: false,
			topics: COMMUNITY_RULES_TOPICS.slice() as CommunityRulesStatusResponse["topics"],
		})),
		acceptRules: vi.fn(async () => ({
			version: COMMUNITY_RULES_VERSION,
			acceptedAt: "2026-09-14T07:00:00.000Z",
			created: true,
		})),
		listBlocks: vi.fn(async () => ({ blockedPseudonyms: [] })),
		block: vi.fn(async () => ({
			blockedPseudonym: "Bartek BGY",
			active: true,
			changed: true,
		})),
		unblock: vi.fn(async () => ({
			blockedPseudonym: "Bartek BGY",
			active: false,
			changed: true,
		})),
		report: vi.fn(async () => ({
			reportId: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
			status: "open" as const,
			created: true,
		})),
		...serviceOverrides,
	};
	const dependencies = {
		createService: () => service,
		getSession: vi.fn(async (request) =>
			request.headers.get("cookie") || request.headers.get("authorization")
				? { user: { id: "user-a" } }
				: null,
		),
	};
	const handlers = mutationLimiter
		? createSafetyHandlers(dependencies, mutationLimiter)
		: createSafetyHandlers(dependencies);
	const app = new Hono();
	app.route("/safety", handlers);
	return { app, service };
}

const cookieHeaders = {
	"content-type": "application/json",
	cookie: "better-auth.session_token=browser",
};

describe("authenticated community safety API", () => {
	it("rejects an unparsable body with the family's fixed Polish copy", async () => {
		const routes = [
			{
				path: "/safety/rules/accept",
				method: "POST",
				error: "Nieprawidłowa wersja zasad społeczności.",
				called: (service: SafetyService) => service.acceptRules,
			},
			{
				path: `/safety/rooms/${ROOM_ID}/blocks`,
				method: "PUT",
				error: "Wskaż prawidłowy pseudonim.",
				called: (service: SafetyService) => service.block,
			},
			{
				path: `/safety/rooms/${ROOM_ID}/reports`,
				method: "POST",
				error: "Sprawdź dane zgłoszenia.",
				called: (service: SafetyService) => service.report,
			},
		] as const;
		for (const route of routes) {
			for (const body of ["{", ""]) {
				const { app, service } = buildApp();
				const response = await app.request(route.path, {
					method: route.method,
					headers: cookieHeaders,
					body,
				});
				expect(response.status).toBe(400);
				expect(await response.json()).toEqual({
					code: "safety_request_invalid",
					error: route.error,
				});
				expect(route.called(service)).not.toHaveBeenCalled();
			}
		}
	});

	it("allows reading and accepting the current rules before sending", async () => {
		const { app, service } = buildApp();
		const status = await app.request("/safety/rules", { headers: cookieHeaders });
		expect(status.status).toBe(200);
		expect(await status.json()).toEqual({
			version: COMMUNITY_RULES_VERSION,
			accepted: false,
			topics: COMMUNITY_RULES_TOPICS,
		});
		const accepted = await app.request("/safety/rules/accept", {
			method: "POST",
			headers: cookieHeaders,
			body: JSON.stringify({ version: COMMUNITY_RULES_VERSION }),
		});
		expect(accepted.status).toBe(200);
		expect(service.acceptRules).toHaveBeenCalledWith("user-a", {
			version: COMMUNITY_RULES_VERSION,
		});
	});

	it("supports block, unblock, and message-report operations for cookie and Bearer sessions", async () => {
		const { app, service } = buildApp();
		const blocked = await app.request(`/safety/rooms/${ROOM_ID}/blocks`, {
			method: "PUT",
			headers: cookieHeaders,
			body: JSON.stringify({ targetPseudonym: "Bartek BGY" }),
		});
		expect(blocked.status).toBe(200);
		const unblocked = await app.request(
			`/safety/rooms/${ROOM_ID}/blocks/${encodeURIComponent("Bartek BGY")}`,
			{
				method: "DELETE",
				headers: { Authorization: "Bearer native-session" },
			},
		);
		expect(unblocked.status).toBe(200);
		const reported = await app.request(`/safety/rooms/${ROOM_ID}/reports`, {
			method: "POST",
			headers: cookieHeaders,
			body: JSON.stringify({
				targetType: "message",
				messageId: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
				reason: "other",
			}),
		});
		expect(reported.status).toBe(201);
		expect(service.block).toHaveBeenCalled();
		expect(service.unblock).toHaveBeenCalled();
		expect(service.report).toHaveBeenCalled();
	});

	it("returns typed controlled authorization failures without writing", async () => {
		const report = vi.fn<NonNullable<SafetyService["report"]>>(async () => {
			throw new SafetyServiceError(
				"safety_target_invalid",
				400,
				"Nie można zgłosić tej osoby ani wiadomości.",
			);
		});
		const { app } = buildApp({ report });
		const response = await app.request(`/safety/rooms/${ROOM_ID}/reports`, {
			method: "POST",
			headers: cookieHeaders,
			body: JSON.stringify({
				targetType: "member",
				targetPseudonym: "Alicja BGY",
				reason: "other",
			}),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			code: "safety_target_invalid",
			error: "Nie można zgłosić tej osoby ani wiadomości.",
		});
	});

	it("rejects unauthenticated safety calls with the same wire code as the room family", async () => {
		const { app, service } = buildApp();
		const routes: Array<[string, RequestInit]> = [
			["/safety/rules", {}],
			[
				"/safety/rules/accept",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ version: COMMUNITY_RULES_VERSION }),
				},
			],
			[`/safety/rooms/${ROOM_ID}/blocks`, {}],
			[
				`/safety/rooms/${ROOM_ID}/blocks`,
				{
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ targetPseudonym: "Bartek BGY" }),
				},
			],
			[`/safety/rooms/${ROOM_ID}/blocks/${encodeURIComponent("Bartek BGY")}`, { method: "DELETE" }],
			[
				`/safety/rooms/${ROOM_ID}/reports`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						targetType: "member",
						targetPseudonym: "Bartek BGY",
						reason: "other",
					}),
				},
			],
		];
		for (const [path, init] of routes) {
			const response = await app.request(path, init);
			expect(response.status, path).toBe(401);
			expect(await response.json()).toEqual({
				code: "UNAUTHORIZED",
				error: "Wymagane jest zalogowanie.",
			});
		}
		for (const call of Object.values(service)) {
			expect(call).not.toHaveBeenCalled();
		}
	});

	it("rejects an unparsable room id on the shared wire code", async () => {
		const { app, service } = buildApp();
		const response = await app.request("/safety/rooms/not-a-room/blocks", {
			headers: cookieHeaders,
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			code: "ROOM_ID_INVALID",
			error: "Nieprawidłowy identyfikator pokoju.",
		});
		expect(service.listBlocks).not.toHaveBeenCalled();
	});

	it("rejects an invalid body at the handler boundary, before the service is called", async () => {
		const { app, service } = buildApp();
		const cases: Array<[keyof SafetyService, string, RequestInit, string]> = [
			[
				"acceptRules",
				"/safety/rules/accept",
				{ method: "POST", headers: cookieHeaders, body: JSON.stringify({}) },
				"Nieprawidłowa wersja zasad społeczności.",
			],
			[
				"block",
				`/safety/rooms/${ROOM_ID}/blocks`,
				{ method: "PUT", headers: cookieHeaders, body: JSON.stringify({ targetPseudonym: "ab" }) },
				"Wskaż prawidłowy pseudonim.",
			],
			[
				"unblock",
				`/safety/rooms/${ROOM_ID}/blocks/ab`,
				{ method: "DELETE", headers: cookieHeaders },
				"Wskaż prawidłowy pseudonim.",
			],
			[
				"report",
				`/safety/rooms/${ROOM_ID}/reports`,
				{ method: "POST", headers: cookieHeaders, body: JSON.stringify({ reason: "other" }) },
				"Sprawdź dane zgłoszenia.",
			],
		];
		for (const [method, path, init, error] of cases) {
			const response = await app.request(path, init);
			expect(response.status, path).toBe(400);
			expect(await response.json()).toEqual({ code: "safety_request_invalid", error });
			expect(service[method], path).not.toHaveBeenCalled();
		}
	});

	it("rate-limits block and report mutations with a controlled Polish error", async () => {
		const binding = { limit: vi.fn(async () => ({ success: false })) } as unknown as RateLimit;
		const limiter = rateLimiter({
			binding,
			limit: 10,
			window: 60,
			errorCode: "safety_rate_limited",
			errorMessage: "Zbyt wiele operacji bezpieczeństwa. Spróbuj ponownie później.",
		});
		const { app, service } = buildApp({}, limiter);
		for (const request of [
			new Request(`http://localhost/safety/rooms/${ROOM_ID}/blocks`, {
				method: "PUT",
				headers: cookieHeaders,
				body: JSON.stringify({ targetPseudonym: "Bartek BGY" }),
			}),
			new Request(`http://localhost/safety/rooms/${ROOM_ID}/reports`, {
				method: "POST",
				headers: cookieHeaders,
				body: JSON.stringify({
					targetType: "member",
					targetPseudonym: "Bartek BGY",
					reason: "other",
				}),
			}),
		]) {
			const response = await app.fetch(request);
			expect(response.status).toBe(429);
			expect(await response.json()).toEqual({
				code: "safety_rate_limited",
				error: "Zbyt wiele operacji bezpieczeństwa. Spróbuj ponownie później.",
			});
		}
		expect(service.block).not.toHaveBeenCalled();
		expect(service.report).not.toHaveBeenCalled();
	});

	it("allows 10 safety actions per minute and recovers after the controlled window", async () => {
		let nowMs = 0;
		let windowStartedAt = 0;
		let used = 0;
		const binding = {
			limit: vi.fn(async () => {
				if (nowMs - windowStartedAt >= 60_000) {
					windowStartedAt = nowMs;
					used = 0;
				}
				used += 1;
				return { success: used <= 10 };
			}),
		} as unknown as RateLimit;
		const { app, service } = buildApp({}, null);
		const env = { RATE_LIMITER: binding } as Env;
		const request = () =>
			app.fetch(
				new Request(`http://localhost/safety/rooms/${ROOM_ID}/reports`, {
					method: "POST",
					headers: cookieHeaders,
					body: JSON.stringify({
						targetType: "member",
						targetPseudonym: "Bartek BGY",
						reason: "other",
					}),
				}),
				env,
			);

		for (let action = 1; action <= 10; action += 1) {
			expect((await request()).status, `action ${action}`).toBe(201);
		}
		const blocked = await request();
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get("Retry-After")).toBe("60");
		expect(await blocked.json()).toEqual({
			code: "safety_rate_limited",
			error: "Zbyt wiele operacji bezpieczeństwa. Spróbuj ponownie za 60 sekund.",
		});
		expect(service.report).toHaveBeenCalledTimes(10);

		nowMs = 60_000;
		expect((await request()).status).toBe(201);
		expect(service.report).toHaveBeenCalledTimes(11);
	});
});
