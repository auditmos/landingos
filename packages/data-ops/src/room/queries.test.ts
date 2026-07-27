import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
	consumeConnectionTicket,
	countRoomMemberships,
	countRoomMessages,
	countRooms,
	createConnectionTicket,
	createRoomMessage,
	getRoomSnapshot,
	joinFlightRoom,
	listActiveRoomsForUser,
	listRoomMessages,
	replaceRoomSelection,
} from "./queries";

const FLIGHT_A = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";
const FLIGHT_B = "018f51b4-c697-74ab-820f-d9e72852a52c";
const USER_A = "user-a";
const USER_B = "user-b";

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
			('${USER_B}', 'User B', 'b@example.com', true, 'Bartek BGY', now(), now());
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
	return {
		client,
		db: drizzle(client) as unknown as Parameters<typeof joinFlightRoom>[0],
	};
}

describe("flight room persistence", () => {
	it("allows direct access at closeAt - 1 ms and rejects it exactly at scheduled arrival +24h", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const closeAt = new Date("2026-09-15T08:20:00.000Z");
			const beforeClose = new Date(closeAt.getTime() - 1);
			const joined = await joinFlightRoom(db, {
				flightInstanceId: FLIGHT_A,
				userId: USER_A,
				now: beforeClose,
			});
			expect(joined.room.closesAt).toBe(closeAt.toISOString());
			expect(await listActiveRoomsForUser(db, USER_A, beforeClose)).toEqual([joined.room]);
			expect(await listActiveRoomsForUser(db, USER_A, closeAt)).toEqual([]);
			await expect(
				joinFlightRoom(db, {
					flightInstanceId: FLIGHT_A,
					userId: USER_B,
					now: closeAt,
				}),
			).rejects.toMatchObject({ code: "ROOM_CLOSED" });
			expect(await countRoomMemberships(db, joined.room.id)).toBe(1);
		} finally {
			await client.close();
		}
	});

	it("creates one room per canonical instance and isolates equal raw numbers on other dates", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const [first, repeated, secondDate] = await Promise.all([
				joinFlightRoom(db, { flightInstanceId: FLIGHT_A, userId: USER_A }),
				joinFlightRoom(db, { flightInstanceId: FLIGHT_A, userId: USER_B }),
				joinFlightRoom(db, { flightInstanceId: FLIGHT_B, userId: USER_A }),
			]);
			expect(repeated.room.id).toBe(first.room.id);
			expect(secondDate.room.id).not.toBe(first.room.id);
			expect(await countRooms(db)).toBe(2);
		} finally {
			await client.close();
		}
	});

	it("makes repeated and concurrent joins idempotent for one user/room", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const joins = await Promise.all(
				Array.from({ length: 20 }, () =>
					joinFlightRoom(db, { flightInstanceId: FLIGHT_A, userId: USER_A }),
				),
			);
			expect(new Set(joins.map((join) => join.membershipId)).size).toBe(1);
			expect(joins.filter((join) => join.membershipCreated)).toHaveLength(1);
			const firstJoin = joins[0];
			expect(firstJoin).toBeDefined();
			if (!firstJoin) throw new Error("Brak wyniku równoległego dołączenia.");
			expect(await countRoomMemberships(db, firstJoin.room.id)).toBe(1);
		} finally {
			await client.close();
		}
	});

	it("persists one redacted selection and atomically replaces it", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const joined = await joinFlightRoom(db, {
				flightInstanceId: FLIGHT_A,
				userId: USER_A,
			});
			await replaceRoomSelection(db, joined.room.id, USER_A, {
				kind: "public_transport",
				badges: ["recommended"],
				modes: ["bus", "train"],
				operatorNames: ["Airport Bus Express", "Trenord"],
			});
			expect((await getRoomSnapshot(db, joined.room.id, USER_A)).member).toEqual({
				pseudonym: "Alicja BGY",
				selection: {
					kind: "public_transport",
					badges: ["recommended"],
					modes: ["bus", "train"],
					operatorNames: ["Airport Bus Express", "Trenord"],
				},
			});

			await replaceRoomSelection(db, joined.room.id, USER_A, { kind: "shared_taxi" });
			const snapshot = await getRoomSnapshot(db, joined.room.id, USER_A);
			expect(snapshot.member).toEqual({
				pseudonym: "Alicja BGY",
				selection: { kind: "shared_taxi" },
			});
			expect(Object.keys(snapshot.member)).toEqual(["pseudonym", "selection"]);
			expect(JSON.stringify(snapshot.members)).not.toMatch(
				/email|userId|role|consent|destination|placeId|latitude|longitude|provider/i,
			);
		} finally {
			await client.close();
		}
	});

	it("returns the persisted message on a duplicate client UUID without creating another row", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const joined = await joinFlightRoom(db, {
				flightInstanceId: FLIGHT_A,
				userId: USER_A,
			});
			const first = await createRoomMessage(db, joined.room.id, USER_A, {
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
				content: "  Pierwsza wiadomość  ",
			});
			const duplicate = await createRoomMessage(db, joined.room.id, USER_A, {
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
				content: "Treść z ponowienia",
			});
			await createRoomMessage(db, joined.room.id, USER_A, {
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
				content: "Druga wiadomość",
			});

			expect(first.created).toBe(true);
			expect(duplicate).toEqual({ created: false, message: first.message });
			expect(await countRoomMessages(db, joined.room.id)).toBe(2);
			expect(
				(await listRoomMessages(db, joined.room.id)).map((message) => message.content),
			).toEqual(["Pierwsza wiadomość", "Druga wiadomość"]);
		} finally {
			await client.close();
		}
	});

	it("consumes a room-bound ticket once and fails closed at its expiry instant", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const roomA = await joinFlightRoom(db, {
				flightInstanceId: FLIGHT_A,
				userId: USER_A,
			});
			const roomB = await joinFlightRoom(db, {
				flightInstanceId: FLIGHT_B,
				userId: USER_A,
			});
			const issuedAt = new Date("2026-09-14T07:00:00.000Z");
			await createConnectionTicket(db, {
				tokenHash: "a".repeat(64),
				roomId: roomA.room.id,
				userId: USER_A,
				expiresAt: new Date("2026-09-14T07:01:00.000Z"),
				createdAt: issuedAt,
			});

			expect(
				await consumeConnectionTicket(db, {
					tokenHash: "a".repeat(64),
					roomId: roomB.room.id,
					now: new Date("2026-09-14T07:00:59.999Z"),
				}),
			).toBeNull();
			expect(
				await consumeConnectionTicket(db, {
					tokenHash: "a".repeat(64),
					roomId: roomA.room.id,
					now: new Date("2026-09-14T07:00:59.999Z"),
				}),
			).toEqual({ userId: USER_A });
			expect(
				await consumeConnectionTicket(db, {
					tokenHash: "a".repeat(64),
					roomId: roomA.room.id,
					now: new Date("2026-09-14T07:00:59.999Z"),
				}),
			).toBeNull();

			await createConnectionTicket(db, {
				tokenHash: "b".repeat(64),
				roomId: roomA.room.id,
				userId: USER_A,
				expiresAt: new Date("2026-09-14T07:01:00.000Z"),
				createdAt: issuedAt,
			});
			expect(
				await consumeConnectionTicket(db, {
					tokenHash: "b".repeat(64),
					roomId: roomA.room.id,
					now: new Date("2026-09-14T07:01:00.000Z"),
				}),
			).toBeNull();
		} finally {
			await client.close();
		}
	});
});
