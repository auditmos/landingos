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
	mutationLimiter: MiddlewareHandler = passThrough,
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
	const handlers = createSafetyHandlers(
		{
			createService: () => service,
			getSession: vi.fn(async (request) =>
				request.headers.get("cookie") || request.headers.get("authorization")
					? { user: { id: "user-a" } }
					: null,
			),
		},
		mutationLimiter,
	);
	const app = new Hono();
	app.route("/safety", handlers);
	return { app, service };
}

const cookieHeaders = {
	"content-type": "application/json",
	cookie: "better-auth.session_token=browser",
};

describe("authenticated community safety API", () => {
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
});
