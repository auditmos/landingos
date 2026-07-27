import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createRoomMessage, getRoomSnapshot, joinFlightRoom, replaceRoomSelection } from "@/room";
import { createSafetyReport } from "@/safety";
import {
	ACCOUNT_MESSAGE_TOMBSTONE,
	ACCOUNT_PSEUDONYM_TOMBSTONE,
	LIFECYCLE_CLEANUP_BATCH_SIZE,
	type LifecycleDatabase,
	MESSAGE_RETENTION_MS,
	prepareAccountDeletion,
	purgeExpiredRoomContent,
	ROOM_ACCESS_WINDOW_MS,
} from "./queries";

const FLIGHT = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";
const USER_A = "user-a";
const USER_B = "user-b";
const ARRIVAL = new Date("2026-09-14T08:20:00.000Z");
const CLOSES_AT = new Date(ARRIVAL.getTime() + ROOM_ACCESS_WINDOW_MS);
const PURGE_AT = new Date(CLOSES_AT.getTime() + MESSAGE_RETENTION_MS);

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
			(id, name, email, email_verified, pseudonym, marketing_consent_granted,
			 marketing_consent_policy_version, marketing_consent_updated_at, created_at, updated_at)
		VALUES
			('${USER_A}', 'Canary User', 'delete-canary-94d2@example.test', true,
			 'Canary94d2', true, 'policy-canary-94d2', now(), now(), now()),
			('${USER_B}', 'User B', 'b@example.com', true, 'Bartek BGY', false, null, null, now(), now());
		INSERT INTO auth_session
			(id, token, user_id, expires_at, created_at, updated_at)
		VALUES
			('session-a', 'cookie-canary-94d2', '${USER_A}', now() + interval '1 day', now(), now()),
			('session-b', 'bearer-canary-94d2', '${USER_A}', now() + interval '1 day', now(), now());
		INSERT INTO auth_verification
			(id, identifier, value, expires_at, created_at, updated_at)
		VALUES
			('verification-a', 'delete-canary-94d2@example.test', 'otp-hash', now() + interval '5 minutes', now(), now());
		INSERT INTO flight_instances
			(id, canonical_key, marketing_carrier_code, marketing_carrier_name,
			 marketing_flight_number, departure_local_date, origin_iata, destination_iata,
			 scheduled_arrival_utc, display_timezone, source)
		VALUES
			('${FLIGHT}', 'fr1234:2026-09-14', 'FR', 'Ryanair', '1234', '2026-09-14',
			 'WAW', 'BGY', '${ARRIVAL.toISOString()}', 'Europe/Rome', 'fixture');
	`);
	const db = drizzle(client) as unknown as LifecycleDatabase;
	const roomA = await joinFlightRoom(db, {
		flightInstanceId: FLIGHT,
		userId: USER_A,
		now: new Date("2026-09-14T07:00:00.000Z"),
	});
	await joinFlightRoom(db, {
		flightInstanceId: FLIGHT,
		userId: USER_B,
		now: new Date("2026-09-14T07:00:00.000Z"),
	});
	return { client, db, room: roomA.room };
}

describe("room lifecycle cleanup", () => {
	it("derives +24h closure and +30d purge, preserving before and purging exactly at the boundary", async () => {
		const { client, db, room } = await createTestDatabase();
		try {
			expect(ROOM_ACCESS_WINDOW_MS).toBe(24 * 60 * 60 * 1_000);
			expect(MESSAGE_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1_000);
			expect(room.closesAt).toBe(CLOSES_AT.toISOString());
			const message = await createRoomMessage(
				db,
				room.id,
				USER_A,
				{
					clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
					content: "message-canary-94d2",
				},
				new Date("2026-09-14T07:00:00.000Z"),
			);
			await createSafetyReport(db, {
				roomId: room.id,
				reporterId: USER_B,
				request: {
					targetType: "message",
					messageId: message.message.id,
					reason: "personal_data",
				},
			});

			expect(
				await purgeExpiredRoomContent(db, {
					now: new Date(PURGE_AT.getTime() - 1),
					batchSize: 1,
				}),
			).toEqual({ roomsScanned: 0, messagesPurged: 0, snapshotsPurged: 0, hasMore: false });
			expect(JSON.stringify(await client.query("SELECT content FROM room_messages"))).toContain(
				"message-canary-94d2",
			);

			expect(
				await purgeExpiredRoomContent(db, {
					now: PURGE_AT,
					batchSize: 1,
				}),
			).toEqual({ roomsScanned: 1, messagesPurged: 1, snapshotsPurged: 1, hasMore: false });
			expect(await client.query("SELECT content FROM room_messages")).toMatchObject({
				rows: [{ content: null }],
			});
			expect(await client.query("SELECT evidence_snapshot FROM safety_reports")).toMatchObject({
				rows: [{ evidence_snapshot: null }],
			});
			expect(
				await purgeExpiredRoomContent(db, {
					now: PURGE_AT,
					batchSize: 1,
				}),
			).toEqual({ roomsScanned: 0, messagesPurged: 0, snapshotsPurged: 0, hasMore: false });
		} finally {
			await client.close();
		}
	});

	it("caps each retry-safe cleanup run to the explicit batch bound", async () => {
		const { client, db, room } = await createTestDatabase();
		try {
			expect(LIFECYCLE_CLEANUP_BATCH_SIZE).toBe(100);
			await createRoomMessage(db, room.id, USER_A, {
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e59",
				content: "purge-base",
			});
			for (let index = 0; index < 2; index += 1) {
				await client.exec(`
					INSERT INTO flight_instances
						(id, canonical_key, marketing_carrier_code, marketing_carrier_name,
						 marketing_flight_number, departure_local_date, origin_iata, destination_iata,
						 scheduled_arrival_utc, display_timezone, source)
					VALUES
						('extra-${index}', 'extra:${index}', 'FR', 'Ryanair', '${index}', '2026-09-14',
						 'WAW', 'BGY', '${ARRIVAL.toISOString()}', 'Europe/Rome', 'fixture');
				`);
				const joined = await joinFlightRoom(db, {
					flightInstanceId: `extra-${index}`,
					userId: USER_B,
					now: new Date("2026-09-14T07:00:00.000Z"),
				});
				await createRoomMessage(db, joined.room.id, USER_B, {
					clientMessageId: `018f4c8e-5697-7df4-8f6e-c7644b137e5${index}`,
					content: `purge-${index}`,
				});
			}
			const first = await purgeExpiredRoomContent(db, { now: PURGE_AT, batchSize: 1 });
			const second = await purgeExpiredRoomContent(db, { now: PURGE_AT, batchSize: 1 });
			const third = await purgeExpiredRoomContent(db, { now: PURGE_AT, batchSize: 1 });
			expect(first).toMatchObject({ roomsScanned: 1, hasMore: true });
			expect(second).toMatchObject({ roomsScanned: 1, hasMore: true });
			expect(third).toMatchObject({ roomsScanned: 1, hasMore: false });
		} finally {
			await client.close();
		}
	});
});

describe("account deletion preparation", () => {
	it("tombstones authored content, unlinks evidence, and removes memberships and selections", async () => {
		const { client, db, room } = await createTestDatabase();
		try {
			await replaceRoomSelection(db, room.id, USER_A, { kind: "shared_taxi" });
			const unreported = await createRoomMessage(db, room.id, USER_A, {
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e61",
				content: "unreported-canary-94d2",
			});
			const reported = await createRoomMessage(db, room.id, USER_A, {
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e62",
				content: "reported-canary-94d2",
			});
			await createSafetyReport(db, {
				roomId: room.id,
				reporterId: USER_B,
				request: {
					targetType: "message",
					messageId: reported.message.id,
					reason: "personal_data",
				},
			});

			const prepared = await prepareAccountDeletion(db, {
				userId: USER_A,
				email: "delete-canary-94d2@example.test",
				now: new Date("2026-09-14T07:30:00.000Z"),
			});
			expect(prepared.rooms).toEqual([{ roomId: room.id, coordinatorKey: FLIGHT }]);
			const messages = await client.query(
				"SELECT id, membership_id, author_pseudonym, content FROM room_messages ORDER BY client_message_id",
			);
			expect(messages.rows).toEqual([
				{
					id: unreported.message.id,
					membership_id: null,
					author_pseudonym: ACCOUNT_PSEUDONYM_TOMBSTONE,
					content: ACCOUNT_MESSAGE_TOMBSTONE,
				},
				{
					id: reported.message.id,
					membership_id: null,
					author_pseudonym: ACCOUNT_PSEUDONYM_TOMBSTONE,
					content: ACCOUNT_MESSAGE_TOMBSTONE,
				},
			]);
			const evidence = await client.query("SELECT evidence_snapshot FROM safety_reports");
			expect(evidence.rows).toEqual([
				{
					evidence_snapshot: {
						messageText: "reported-canary-94d2",
						authorPseudonym: ACCOUNT_PSEUDONYM_TOMBSTONE,
						originalMessageAt: expect.any(String),
					},
				},
			]);
			expect((await client.query("SELECT * FROM room_memberships")).rows).toHaveLength(1);
			expect((await client.query("SELECT * FROM room_selections")).rows).toHaveLength(0);
			expect((await client.query("SELECT * FROM auth_verification")).rows).toHaveLength(0);
			const publicSnapshot = await getRoomSnapshot(db, room.id, USER_B);
			expect(publicSnapshot.messages.map((message) => message.content)).toEqual([
				ACCOUNT_MESSAGE_TOMBSTONE,
				ACCOUNT_MESSAGE_TOMBSTONE,
			]);
			expect(JSON.stringify(publicSnapshot)).not.toMatch(
				/delete-canary-94d2|Canary94d2|unreported-canary-94d2|reported-canary-94d2/i,
			);

			expect(
				await prepareAccountDeletion(db, {
					userId: USER_A,
					email: "delete-canary-94d2@example.test",
					now: new Date("2026-09-14T07:31:00.000Z"),
				}),
			).toEqual({ rooms: [] });
		} finally {
			await client.close();
		}
	});
});
