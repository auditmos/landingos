import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createRoomMessage, getRoomSnapshot, joinFlightRoom, type RoomDatabase } from "@/room";
import {
	acceptCommunityRules,
	blockRoomMember,
	countCommunityRulesAcceptances,
	countSafetyReports,
	createSafetyReport,
	hasCommunityRulesAcceptance,
	listBlockedMemberPseudonyms,
	listBlockedRecipientIds,
	SafetyQueryError,
	unblockRoomMember,
} from "./queries";
import { COMMUNITY_RULES_VERSION } from "./schema";

const FLIGHT_A = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";
const FLIGHT_B = "018f51b4-c697-74ab-820f-d9e72852a52c";
const USER_A = "user-a";
const USER_B = "user-b";
const USER_C = "user-c";
const MESSAGE_B = "018f4c8e-5697-7df4-8f6e-c7644b137e61";
const MESSAGE_C = "018f4c8e-5697-7df4-8f6e-c7644b137e62";

async function createTestDatabase() {
	const client = new PGlite();
	const migrationDirectory = resolve(import.meta.dirname, "../drizzle/migrations/dev");
	for (const migrationName of readdirSync(migrationDirectory)
		.filter((name) => name.endsWith(".sql"))
		.sort()) {
		await client.exec(readFileSync(resolve(migrationDirectory, migrationName), "utf8"));
	}
	await client.exec(`
		INSERT INTO auth_user
			(id, name, email, email_verified, pseudonym, created_at, updated_at)
		VALUES
			('${USER_A}', 'User A', 'a@example.com', true, 'Alicja BGY', now(), now()),
			('${USER_B}', 'User B', 'b@example.com', true, 'Bartek BGY', now(), now()),
			('${USER_C}', 'User C', 'c@example.com', true, 'Celina BGY', now(), now());
		INSERT INTO flight_instances
			(id, canonical_key, marketing_carrier_code, marketing_carrier_name,
			 marketing_flight_number, departure_local_date, origin_iata, destination_iata,
			 scheduled_arrival_utc, display_timezone, source)
		VALUES
			('${FLIGHT_A}', 'fr1234:2026-09-14', 'FR', 'Ryanair', '1234', '2026-09-14',
			 'WAW', 'BGY', '2026-09-14T08:20:00Z', 'Europe/Rome', 'fixture'),
			('${FLIGHT_B}', 'fr1234:2026-09-15', 'FR', 'Ryanair', '1234', '2026-09-15',
			 'WAW', 'BGY', '2026-09-15T08:20:00Z', 'Europe/Rome', 'fixture');
	`);
	const db = drizzle(client) as unknown as RoomDatabase;
	const roomA = await joinFlightRoom(db, { flightInstanceId: FLIGHT_A, userId: USER_A });
	await joinFlightRoom(db, { flightInstanceId: FLIGHT_A, userId: USER_B });
	await joinFlightRoom(db, { flightInstanceId: FLIGHT_A, userId: USER_C });
	const roomB = await joinFlightRoom(db, { flightInstanceId: FLIGHT_B, userId: USER_A });
	await joinFlightRoom(db, { flightInstanceId: FLIGHT_B, userId: USER_B });
	return { client, db, roomA: roomA.room, roomB: roomB.room };
}

describe("versioned community-rules acceptance", () => {
	it("is idempotent per user/version and requires acceptance again for a new version", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const first = await acceptCommunityRules(db, {
				userId: USER_A,
				rulesVersion: COMMUNITY_RULES_VERSION,
				acceptedAt: new Date("2026-09-14T06:00:00.000Z"),
			});
			const retry = await acceptCommunityRules(db, {
				userId: USER_A,
				rulesVersion: COMMUNITY_RULES_VERSION,
				acceptedAt: new Date("2026-09-14T06:01:00.000Z"),
			});
			expect(first.created).toBe(true);
			expect(retry).toEqual({ ...first, created: false });
			expect(await countCommunityRulesAcceptances(db, USER_A)).toBe(1);
			expect(await hasCommunityRulesAcceptance(db, USER_A, COMMUNITY_RULES_VERSION)).toBe(true);
			expect(await hasCommunityRulesAcceptance(db, USER_A, "2026-10-01-v2")).toBe(false);
		} finally {
			await client.close();
		}
	});
});

describe("directional room blocking", () => {
	it("filters history and recipient events while preserving unrelated views and missed history", async () => {
		const { client, db, roomA } = await createTestDatabase();
		try {
			await createRoomMessage(
				db,
				roomA.id,
				USER_B,
				{ clientMessageId: MESSAGE_B, content: "Wiadomość Bartka" },
				new Date("2026-09-14T07:00:00.000Z"),
			);
			await createRoomMessage(
				db,
				roomA.id,
				USER_C,
				{ clientMessageId: MESSAGE_C, content: "Wiadomość Celiny" },
				new Date("2026-09-14T07:01:00.000Z"),
			);

			const first = await blockRoomMember(db, {
				roomId: roomA.id,
				blockerId: USER_A,
				targetPseudonym: "Bartek BGY",
				now: new Date("2026-09-14T07:30:00.000Z"),
			});
			const retry = await blockRoomMember(db, {
				roomId: roomA.id,
				blockerId: USER_A,
				targetPseudonym: "Bartek BGY",
				now: new Date("2026-09-14T07:31:00.000Z"),
			});
			expect(first).toMatchObject({ created: true, blockedPseudonym: "Bartek BGY" });
			expect(retry).toMatchObject({ created: false, blockedPseudonym: "Bartek BGY" });
			expect(
				(await getRoomSnapshot(db, roomA.id, USER_A)).messages.map((item) => item.content),
			).toEqual(["Wiadomość Celiny"]);
			expect((await getRoomSnapshot(db, roomA.id, USER_B)).messages).toHaveLength(2);
			expect((await getRoomSnapshot(db, roomA.id, USER_C)).messages).toHaveLength(2);
			expect(await listBlockedMemberPseudonyms(db, roomA.id, USER_A)).toEqual(["Bartek BGY"]);
			expect(await listBlockedRecipientIds(db, roomA.id, USER_B)).toEqual([USER_A]);

			expect(
				await unblockRoomMember(db, {
					roomId: roomA.id,
					blockerId: USER_A,
					targetPseudonym: "Bartek BGY",
					now: new Date("2026-09-14T08:00:00.000Z"),
				}),
			).toMatchObject({ changed: true, blockedPseudonym: "Bartek BGY" });
			await createRoomMessage(
				db,
				roomA.id,
				USER_B,
				{
					clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e63",
					content: "Nowa wiadomość po odblokowaniu",
				},
				new Date("2026-09-14T08:01:00.000Z"),
			);
			expect(
				(await getRoomSnapshot(db, roomA.id, USER_A)).messages.map((item) => item.content),
			).toEqual(["Wiadomość Celiny", "Nowa wiadomość po odblokowaniu"]);
			expect(await listBlockedRecipientIds(db, roomA.id, USER_B)).toEqual([]);
		} finally {
			await client.close();
		}
	});

	it("rejects self, cross-room, and nonexistent targets without changing block rows", async () => {
		const { client, db, roomA, roomB } = await createTestDatabase();
		try {
			for (const [roomId, targetPseudonym] of [
				[roomA.id, "Alicja BGY"],
				[roomA.id, "Nie Istnieje"],
				[roomB.id, "Celina BGY"],
			] as const) {
				await expect(
					blockRoomMember(db, {
						roomId,
						blockerId: USER_A,
						targetPseudonym,
					}),
				).rejects.toBeInstanceOf(SafetyQueryError);
			}
			expect(await listBlockedMemberPseudonyms(db, roomA.id, USER_A)).toEqual([]);
		} finally {
			await client.close();
		}
	});
});

describe("authorized and idempotent safety reports", () => {
	it("persists member and message reports with an exact bounded evidence snapshot", async () => {
		const { client, db, roomA } = await createTestDatabase();
		try {
			const reportedMessage = await createRoomMessage(
				db,
				roomA.id,
				USER_B,
				{ clientMessageId: MESSAGE_B, content: "  Niewłaściwa wiadomość  " },
				new Date("2026-09-14T07:00:00.000Z"),
			);
			const memberReport = await createSafetyReport(db, {
				roomId: roomA.id,
				reporterId: USER_A,
				request: {
					targetType: "member",
					targetPseudonym: "Bartek BGY",
					reason: "harassment_or_discrimination",
					note: "Proszę sprawdzić.",
				},
				createdAt: new Date("2026-09-14T07:10:00.000Z"),
			});
			const messageReport = await createSafetyReport(db, {
				roomId: roomA.id,
				reporterId: USER_A,
				request: {
					targetType: "message",
					messageId: reportedMessage.message.id,
					reason: "money_or_private_information",
				},
				createdAt: new Date("2026-09-14T07:11:00.000Z"),
			});
			const retry = await createSafetyReport(db, {
				roomId: roomA.id,
				reporterId: USER_A,
				request: {
					targetType: "message",
					messageId: reportedMessage.message.id,
					reason: "other",
					note: "Ta treść nie może zastąpić pierwszego snapshotu.",
				},
			});

			expect(memberReport.report).toMatchObject({
				roomId: roomA.id,
				reporterId: USER_A,
				targetUserId: USER_B,
				messageId: null,
				status: "open",
				evidenceSnapshot: null,
			});
			expect(messageReport.report.evidenceSnapshot).toEqual({
				messageText: "Niewłaściwa wiadomość",
				authorPseudonym: "Bartek BGY",
				originalMessageAt: "2026-09-14T07:00:00.000Z",
			});
			expect(Object.keys(messageReport.report.evidenceSnapshot ?? {})).toEqual([
				"messageText",
				"authorPseudonym",
				"originalMessageAt",
			]);
			expect(retry).toEqual({ created: false, report: messageReport.report });
			expect(await countSafetyReports(db)).toBe(2);
			expect(JSON.stringify([memberReport.report, messageReport.report])).not.toMatch(
				/email|destination|placeId|coordinates|consent|role|provider|unrelated/i,
			);
		} finally {
			await client.close();
		}
	});

	it("rejects self, cross-room, and nonexistent report targets without rows", async () => {
		const { client, db, roomA, roomB } = await createTestDatabase();
		try {
			const crossRoomMessage = await createRoomMessage(db, roomB.id, USER_B, {
				clientMessageId: MESSAGE_B,
				content: "Wiadomość z innego pokoju",
			});
			const selfMessage = await createRoomMessage(db, roomA.id, USER_A, {
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e64",
				content: "Własna wiadomość",
			});
			const invalidRequests = [
				{
					roomId: roomA.id,
					request: {
						targetType: "member",
						targetPseudonym: "Alicja BGY",
						reason: "other",
					},
				},
				{
					roomId: roomA.id,
					request: {
						targetType: "member",
						targetPseudonym: "Nie Istnieje",
						reason: "other",
					},
				},
				{
					roomId: roomB.id,
					request: {
						targetType: "member",
						targetPseudonym: "Celina BGY",
						reason: "other",
					},
				},
				{
					roomId: roomA.id,
					request: {
						targetType: "message",
						messageId: crossRoomMessage.message.id,
						reason: "other",
					},
				},
				{
					roomId: roomA.id,
					request: {
						targetType: "message",
						messageId: selfMessage.message.id,
						reason: "other",
					},
				},
			] as const;
			for (const invalid of invalidRequests) {
				await expect(
					createSafetyReport(db, {
						roomId: invalid.roomId,
						reporterId: USER_A,
						request: invalid.request,
					}),
				).rejects.toBeInstanceOf(SafetyQueryError);
			}
			expect(await countSafetyReports(db)).toBe(0);
		} finally {
			await client.close();
		}
	});
});
