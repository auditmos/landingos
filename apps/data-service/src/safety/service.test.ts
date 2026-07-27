import {
	COMMUNITY_RULES_TOPICS,
	COMMUNITY_RULES_VERSION,
	type SafetyReportRecord,
} from "@repo/data-ops/safety";
import { describe, expect, it, vi } from "vitest";
import {
	createSafetyService,
	type SafetyServiceDependencies,
	type SafetyServiceError,
} from "./service";

const ROOM_ID = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";
const REPORT_ID = "018f4c8e-5697-7df4-8f6e-c7644b137e51";

function dependencies(
	overrides: Partial<SafetyServiceDependencies> = {},
): SafetyServiceDependencies {
	return {
		now: () => new Date("2026-09-14T07:00:00.000Z"),
		rulesVersion: COMMUNITY_RULES_VERSION,
		hasCommunityRulesAcceptance: vi.fn(async () => false),
		acceptCommunityRules: vi.fn(async (input) => ({
			acceptance: {
				...input,
				acceptedAt: input.acceptedAt ?? new Date("2026-09-14T07:00:00.000Z"),
			},
			created: true,
		})),
		listBlockedMemberPseudonyms: vi.fn(async () => []),
		blockRoomMember: vi.fn(async () => ({
			blockedPseudonym: "Bartek BGY",
			created: true,
			changed: true,
		})),
		unblockRoomMember: vi.fn(async () => ({
			blockedPseudonym: "Bartek BGY",
			changed: true,
		})),
		createSafetyReport: vi.fn(async (input) => ({
			created: true,
			report: {
				id: REPORT_ID,
				roomId: input.roomId,
				reporterId: input.reporterId,
				targetUserId: "user-b",
				messageId: null,
				reason: "other",
				note: null,
				status: "open",
				evidenceSnapshot: null,
				createdAt: "2026-09-14T07:00:00.000Z",
			} satisfies SafetyReportRecord,
		})),
		...overrides,
	};
}

describe("community rules service", () => {
	it("returns the exact current Polish rules before acceptance", async () => {
		const status = await createSafetyService(dependencies()).getRulesStatus("user-a");
		expect(status).toEqual({
			version: COMMUNITY_RULES_VERSION,
			accepted: false,
			topics: COMMUNITY_RULES_TOPICS,
		});
	});

	it("accepts the configured version idempotently and rejects a stale version", async () => {
		const deps = dependencies();
		const service = createSafetyService(deps);
		expect(await service.acceptRules("user-a", { version: COMMUNITY_RULES_VERSION })).toEqual({
			version: COMMUNITY_RULES_VERSION,
			acceptedAt: "2026-09-14T07:00:00.000Z",
			created: true,
		});
		expect(deps.acceptCommunityRules).toHaveBeenCalledWith({
			userId: "user-a",
			rulesVersion: COMMUNITY_RULES_VERSION,
			acceptedAt: new Date("2026-09-14T07:00:00.000Z"),
		});
		await expect(service.acceptRules("user-a", { version: "2026-01-01-old" })).rejects.toEqual(
			expect.objectContaining<Partial<SafetyServiceError>>({
				code: "rules_version_outdated",
				status: 409,
				message: expect.stringMatching(/zmieniły/i),
			}),
		);
	});

	it("requires a new acceptance when the controlled current version changes", async () => {
		const hasAcceptance = vi.fn(async (_userId: string, version: string) => {
			return version === COMMUNITY_RULES_VERSION;
		});
		const status = await createSafetyService(
			dependencies({
				rulesVersion: "2026-10-01-v2",
				hasCommunityRulesAcceptance: hasAcceptance,
			}),
		).getRulesStatus("user-a");
		expect(status.accepted).toBe(false);
		expect(hasAcceptance).toHaveBeenCalledWith("user-a", "2026-10-01-v2");
	});
});

describe("block and report safety service", () => {
	it("returns controlled public responses for block, unblock, and report retries", async () => {
		const service = createSafetyService(dependencies());
		expect(await service.block("user-a", ROOM_ID, { targetPseudonym: "Bartek BGY" })).toEqual({
			blockedPseudonym: "Bartek BGY",
			active: true,
			changed: true,
		});
		expect(await service.unblock("user-a", ROOM_ID, "Bartek BGY")).toEqual({
			blockedPseudonym: "Bartek BGY",
			active: false,
			changed: true,
		});
		expect(
			await service.report("user-a", ROOM_ID, {
				targetType: "member",
				targetPseudonym: "Bartek BGY",
				reason: "other",
			}),
		).toEqual({ reportId: REPORT_ID, status: "open", created: true });
	});
});
