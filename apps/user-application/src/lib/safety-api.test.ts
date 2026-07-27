import { COMMUNITY_RULES_TOPICS, COMMUNITY_RULES_VERSION } from "@repo/data-ops/safety";
import { describe, expect, it, vi } from "vitest";
import {
	acceptCommunityRules,
	blockRoomMember,
	fetchBlockedMembers,
	fetchCommunityRules,
	reportRoomSafety,
	unblockRoomMember,
} from "./safety-api";

const ROOM_ID = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";

function response(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("browser safety API", () => {
	it("uses credentialed cookie requests and validates the current rules response", async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			response({
				version: COMMUNITY_RULES_VERSION,
				accepted: false,
				topics: COMMUNITY_RULES_TOPICS,
			}),
		);
		expect(await fetchCommunityRules(fetchImpl)).toEqual({
			version: COMMUNITY_RULES_VERSION,
			accepted: false,
			topics: COMMUNITY_RULES_TOPICS,
		});
		expect(fetchImpl).toHaveBeenCalledWith(
			expect.stringContaining("/safety/rules"),
			expect.objectContaining({ credentials: "include" }),
		);
		expect(JSON.stringify(fetchImpl.mock.calls[0]?.[1])).not.toContain("Authorization");
	});

	it("accepts rules and performs block/unblock with strict public responses", async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				response({
					version: COMMUNITY_RULES_VERSION,
					acceptedAt: "2026-09-14T07:00:00.000Z",
					created: true,
				}),
			)
			.mockResolvedValueOnce(
				response({ blockedPseudonym: "Bartek BGY", active: true, changed: true }),
			)
			.mockResolvedValueOnce(response({ blockedPseudonyms: ["Bartek BGY"] }))
			.mockResolvedValueOnce(
				response({ blockedPseudonym: "Bartek BGY", active: false, changed: true }),
			);
		await acceptCommunityRules(COMMUNITY_RULES_VERSION, fetchImpl);
		await blockRoomMember(ROOM_ID, "Bartek BGY", fetchImpl);
		expect(await fetchBlockedMembers(ROOM_ID, fetchImpl)).toEqual({
			blockedPseudonyms: ["Bartek BGY"],
		});
		await unblockRoomMember(ROOM_ID, "Bartek BGY", fetchImpl);
		expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
			expect.stringContaining("/safety/rules/accept"),
			expect.stringContaining(`/safety/rooms/${ROOM_ID}/blocks`),
			expect.stringContaining(`/safety/rooms/${ROOM_ID}/blocks`),
			expect.stringContaining(
				`/safety/rooms/${ROOM_ID}/blocks/${encodeURIComponent("Bartek BGY")}`,
			),
		]);
	});

	it("sends only the bounded report contract and parses idempotent retries", async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			response({
				reportId: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
				status: "open",
				created: false,
			}),
		);
		expect(
			await reportRoomSafety(
				ROOM_ID,
				{
					targetType: "message",
					messageId: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
					reason: "other",
					note: "Proszę sprawdzić.",
				},
				fetchImpl,
			),
		).toMatchObject({ status: "open", created: false });
		const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
		expect(Object.keys(body).sort()).toEqual(["targetType", "messageId", "reason", "note"].sort());
		expect(JSON.stringify(body)).not.toMatch(
			/email|destination|placeId|coordinates|consent|role|provider/i,
		);
	});
});
