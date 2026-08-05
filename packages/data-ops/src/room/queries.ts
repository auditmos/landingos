import { and, asc, count, desc, eq, gt, isNotNull, isNull, lte, notExists, or } from "drizzle-orm";
import type { getDb } from "@/database/setup";
import { auth_user } from "@/drizzle/auth-schema";
import { flightInstances } from "@/flight/table";
import { MESSAGE_RETENTION_MS, ROOM_ACCESS_WINDOW_MS } from "@/lifecycle/constants";
import { userBlocks } from "@/safety/table";
import {
	type PastFlightListing,
	PastFlightListingSchema,
	type PublicRoom,
	type PublicRoomMember,
	PublicRoomMemberSchema,
	type PublicRoomMessage,
	PublicRoomMessageSchema,
	PublicRoomSchema,
	type RoomListing,
	RoomListingSchema,
	type RoomMessageCreateRequest,
	RoomMessageCreateRequestSchema,
	type RoomSelection,
	RoomSelectionSchema,
	type RoomSnapshot,
	RoomSnapshotSchema,
} from "./schema";
import {
	flightRooms,
	roomConnectionTickets,
	roomMemberships,
	roomMessages,
	roomSelections,
} from "./table";

export type RoomDatabase = Pick<ReturnType<typeof getDb>, "insert" | "select" | "update">;

export interface JoinFlightRoomInput {
	flightInstanceId: string;
	userId: string;
	now?: Date;
}

export interface JoinFlightRoomResult {
	room: PublicRoom;
	membershipId: string;
	membershipCreated: boolean;
}

export interface RoomAccessContext {
	room: PublicRoom;
	membershipId: string;
	userId: string;
	coordinatorKey: string;
}

export class RoomQueryError extends Error {
	constructor(readonly code: "FLIGHT_NOT_FOUND" | "ROOM_CLOSED") {
		super(
			code === "ROOM_CLOSED"
				? "Pokój tego lotu jest już zamknięty."
				: "Nie znaleziono rozpoznanego lotu.",
		);
		this.name = "RoomQueryError";
	}
}

export interface CreateConnectionTicketInput {
	tokenHash: string;
	roomId: string;
	userId: string;
	expiresAt: Date;
	createdAt?: Date;
}

function roomFromRow(row: { id: string; flightInstanceId: string; closesAt: Date }): PublicRoom {
	return PublicRoomSchema.parse({ ...row, closesAt: row.closesAt.toISOString() });
}

function memberFromRow(row: { pseudonym: string | null; selection: unknown }): PublicRoomMember {
	if (!row.pseudonym) {
		throw new Error("Członek pokoju nie ma prawidłowego pseudonimu.");
	}
	return PublicRoomMemberSchema.parse({
		pseudonym: row.pseudonym,
		selection: row.selection === null ? null : RoomSelectionSchema.parse(row.selection),
	});
}

function messageFromRow(row: {
	id: string;
	clientMessageId: string;
	authorPseudonym: string;
	content: string | null;
	createdAt: Date;
}): PublicRoomMessage | null {
	if (row.content === null) return null;
	return PublicRoomMessageSchema.parse({
		id: row.id,
		clientMessageId: row.clientMessageId,
		pseudonym: row.authorPseudonym,
		content: row.content,
		createdAt: row.createdAt.toISOString(),
	});
}

async function findRoomByFlightInstance(
	db: RoomDatabase,
	flightInstanceId: string,
): Promise<PublicRoom | null> {
	const [row] = await db
		.select({
			id: flightRooms.id,
			flightInstanceId: flightRooms.flightInstanceId,
			closesAt: flightRooms.closesAt,
		})
		.from(flightRooms)
		.where(eq(flightRooms.flightInstanceId, flightInstanceId))
		.limit(1);
	return row ? roomFromRow(row) : null;
}

export async function getRoomById(db: RoomDatabase, roomId: string): Promise<PublicRoom | null> {
	const [row] = await db
		.select({
			id: flightRooms.id,
			flightInstanceId: flightRooms.flightInstanceId,
			closesAt: flightRooms.closesAt,
		})
		.from(flightRooms)
		.where(eq(flightRooms.id, roomId))
		.limit(1);
	return row ? roomFromRow(row) : null;
}

async function getMembership(
	db: RoomDatabase,
	roomId: string,
	userId: string,
): Promise<{ id: string; userId: string; pseudonym: string | null } | null> {
	const [row] = await db
		.select({
			id: roomMemberships.id,
			userId: roomMemberships.userId,
			pseudonym: auth_user.pseudonym,
		})
		.from(roomMemberships)
		.innerJoin(auth_user, eq(roomMemberships.userId, auth_user.id))
		.where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId)))
		.limit(1);
	return row ?? null;
}

export async function joinFlightRoom(
	db: RoomDatabase,
	input: JoinFlightRoomInput,
): Promise<JoinFlightRoomResult> {
	const [flight] = await db
		.select({ scheduledArrivalUtc: flightInstances.scheduledArrivalUtc })
		.from(flightInstances)
		.where(eq(flightInstances.id, input.flightInstanceId))
		.limit(1);
	if (!flight) throw new RoomQueryError("FLIGHT_NOT_FOUND");
	const closesAt = new Date(flight.scheduledArrivalUtc.getTime() + ROOM_ACCESS_WINDOW_MS);
	if ((input.now ?? new Date()).getTime() >= closesAt.getTime()) {
		throw new RoomQueryError("ROOM_CLOSED");
	}
	const messagePurgeAt = new Date(closesAt.getTime() + MESSAGE_RETENTION_MS);
	const [insertedRoom] = await db
		.insert(flightRooms)
		.values({
			id: crypto.randomUUID(),
			flightInstanceId: input.flightInstanceId,
			closesAt,
			messagePurgeAt,
		})
		.onConflictDoNothing({ target: flightRooms.flightInstanceId })
		.returning({
			id: flightRooms.id,
			flightInstanceId: flightRooms.flightInstanceId,
			closesAt: flightRooms.closesAt,
		});
	const room =
		(insertedRoom ? roomFromRow(insertedRoom) : null) ??
		(await findRoomByFlightInstance(db, input.flightInstanceId));
	if (!room) {
		throw new Error("Nie udało się utworzyć pokoju dla tego lotu.");
	}

	const [insertedMembership] = await db
		.insert(roomMemberships)
		.values({
			id: crypto.randomUUID(),
			roomId: room.id,
			userId: input.userId,
		})
		.onConflictDoNothing({
			target: [roomMemberships.roomId, roomMemberships.userId],
		})
		.returning({ id: roomMemberships.id });
	const membership = insertedMembership ?? (await getMembership(db, room.id, input.userId));
	if (!membership) {
		throw new Error("Nie udało się dołączyć do pokoju.");
	}
	return {
		room,
		membershipId: membership.id,
		membershipCreated: Boolean(insertedMembership),
	};
}

export async function getRoomAccessContext(
	db: RoomDatabase,
	roomId: string,
	userId: string,
): Promise<RoomAccessContext | null> {
	const [row] = await db
		.select({
			roomId: flightRooms.id,
			flightInstanceId: flightRooms.flightInstanceId,
			membershipId: roomMemberships.id,
			userId: roomMemberships.userId,
			closesAt: flightRooms.closesAt,
		})
		.from(roomMemberships)
		.innerJoin(flightRooms, eq(roomMemberships.roomId, flightRooms.id))
		.where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId)))
		.limit(1);
	if (!row) return null;
	return {
		room: roomFromRow({
			id: row.roomId,
			flightInstanceId: row.flightInstanceId,
			closesAt: row.closesAt,
		}),
		membershipId: row.membershipId,
		userId: row.userId,
		coordinatorKey: row.flightInstanceId,
	};
}

export async function listPublicRoomMembers(
	db: RoomDatabase,
	roomId: string,
): Promise<PublicRoomMember[]> {
	const rows = await db
		.select({
			pseudonym: auth_user.pseudonym,
			selection: roomSelections.selection,
		})
		.from(roomMemberships)
		.innerJoin(auth_user, eq(roomMemberships.userId, auth_user.id))
		.leftJoin(roomSelections, eq(roomMemberships.id, roomSelections.membershipId))
		.where(eq(roomMemberships.roomId, roomId))
		.orderBy(asc(roomMemberships.createdAt), asc(roomMemberships.id));
	return rows.map(memberFromRow);
}

export async function getPublicRoomMember(
	db: RoomDatabase,
	roomId: string,
	userId: string,
): Promise<PublicRoomMember | null> {
	const [row] = await db
		.select({
			pseudonym: auth_user.pseudonym,
			selection: roomSelections.selection,
		})
		.from(roomMemberships)
		.innerJoin(auth_user, eq(roomMemberships.userId, auth_user.id))
		.leftJoin(roomSelections, eq(roomMemberships.id, roomSelections.membershipId))
		.where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId)))
		.limit(1);
	return row ? memberFromRow(row) : null;
}

export async function replaceRoomSelection(
	db: RoomDatabase,
	roomId: string,
	userId: string,
	input: RoomSelection,
): Promise<PublicRoomMember> {
	const selection = RoomSelectionSchema.parse(input);
	const membership = await getMembership(db, roomId, userId);
	if (!membership) {
		throw new Error("Nie należysz do tego pokoju.");
	}
	await db
		.insert(roomSelections)
		.values({ membershipId: membership.id, selection, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: roomSelections.membershipId,
			set: { selection, updatedAt: new Date() },
		});
	const member = await getPublicRoomMember(db, roomId, userId);
	if (!member) {
		throw new Error("Nie udało się odczytać wyboru transportu.");
	}
	return member;
}

export async function listRoomMessages(
	db: RoomDatabase,
	roomId: string,
	viewerUserId?: string,
): Promise<PublicRoomMessage[]> {
	const hiddenByBlock = viewerUserId
		? notExists(
				db
					.select({ blockerId: userBlocks.blockerId })
					.from(userBlocks)
					.where(
						and(
							eq(userBlocks.blockerId, viewerUserId),
							eq(userBlocks.blockedId, roomMemberships.userId),
							or(
								eq(userBlocks.active, true),
								and(
									isNotNull(userBlocks.hiddenThrough),
									lte(roomMessages.createdAt, userBlocks.hiddenThrough),
								),
							),
						),
					),
			)
		: undefined;
	const rows = await db
		.select({
			id: roomMessages.id,
			clientMessageId: roomMessages.clientMessageId,
			authorPseudonym: roomMessages.authorPseudonym,
			content: roomMessages.content,
			createdAt: roomMessages.createdAt,
		})
		.from(roomMessages)
		.leftJoin(roomMemberships, eq(roomMessages.membershipId, roomMemberships.id))
		.where(and(eq(roomMessages.roomId, roomId), isNotNull(roomMessages.content), hiddenByBlock))
		.orderBy(asc(roomMessages.sequence));
	return rows.flatMap((row) => {
		const message = messageFromRow(row);
		return message ? [message] : [];
	});
}

async function getRoomMessageByClientId(
	db: RoomDatabase,
	roomId: string,
	clientMessageId: string,
): Promise<PublicRoomMessage | null> {
	const [row] = await db
		.select({
			id: roomMessages.id,
			clientMessageId: roomMessages.clientMessageId,
			authorPseudonym: roomMessages.authorPseudonym,
			content: roomMessages.content,
			createdAt: roomMessages.createdAt,
		})
		.from(roomMessages)
		.where(and(eq(roomMessages.roomId, roomId), eq(roomMessages.clientMessageId, clientMessageId)))
		.limit(1);
	return row ? messageFromRow(row) : null;
}

export async function createRoomMessage(
	db: RoomDatabase,
	roomId: string,
	userId: string,
	input: RoomMessageCreateRequest,
	createdAt = new Date(),
): Promise<{ message: PublicRoomMessage; created: boolean }> {
	const messageInput = RoomMessageCreateRequestSchema.parse(input);
	const membership = await getMembership(db, roomId, userId);
	if (!membership) {
		throw new Error("Nie należysz do tego pokoju.");
	}
	if (!membership.pseudonym) {
		throw new Error("Autor wiadomości nie ma prawidłowego pseudonimu.");
	}
	const [inserted] = await db
		.insert(roomMessages)
		.values({
			id: crypto.randomUUID(),
			roomId,
			membershipId: membership.id,
			clientMessageId: messageInput.clientMessageId,
			authorPseudonym: membership.pseudonym,
			content: messageInput.content,
			createdAt,
		})
		.onConflictDoNothing({
			target: [roomMessages.roomId, roomMessages.clientMessageId],
		})
		.returning({ id: roomMessages.id });
	const message = await getRoomMessageByClientId(db, roomId, messageInput.clientMessageId);
	if (!message) {
		throw new Error("Nie udało się zapisać wiadomości.");
	}
	return { message, created: Boolean(inserted) };
}

export async function listActiveRoomsForUser(
	db: RoomDatabase,
	userId: string,
	now = new Date(),
): Promise<RoomListing[]> {
	const rows = await db
		.select({
			id: flightRooms.id,
			flightInstanceId: flightRooms.flightInstanceId,
			closesAt: flightRooms.closesAt,
			flight: flightListingColumns,
		})
		.from(roomMemberships)
		.innerJoin(flightRooms, eq(roomMemberships.roomId, flightRooms.id))
		.innerJoin(flightInstances, eq(flightRooms.flightInstanceId, flightInstances.id))
		.where(and(eq(roomMemberships.userId, userId), gt(flightRooms.closesAt, now)))
		.orderBy(asc(flightRooms.closesAt), asc(flightRooms.id));
	return rows.map((row) =>
		RoomListingSchema.parse({
			id: row.id,
			flightInstanceId: row.flightInstanceId,
			closesAt: row.closesAt.toISOString(),
			flight: flightFromJoinedRow(row.flight),
		}),
	);
}

const flightListingColumns = {
	id: flightInstances.id,
	marketingCarrierCode: flightInstances.marketingCarrierCode,
	marketingCarrierName: flightInstances.marketingCarrierName,
	marketingFlightNumber: flightInstances.marketingFlightNumber,
	operatingCarrierCode: flightInstances.operatingCarrierCode,
	operatingFlightNumber: flightInstances.operatingFlightNumber,
	departureLocalDate: flightInstances.departureLocalDate,
	originIata: flightInstances.originIata,
	destinationIata: flightInstances.destinationIata,
	scheduledArrivalUtc: flightInstances.scheduledArrivalUtc,
	displayTimezone: flightInstances.displayTimezone,
	source: flightInstances.source,
};

function flightFromJoinedRow(flight: { scheduledArrivalUtc: Date } & Record<string, unknown>) {
	return { ...flight, scheduledArrivalUtc: flight.scheduledArrivalUtc.toISOString() };
}

const PAST_FLIGHTS_LIMIT = 10;

/**
 * The traveler's recently closed flights, reduced to flight identity for the
 * replan shortcut. Bounded to the MESSAGE_RETENTION_MS window so no indefinite
 * travel history accumulates in the UI (US-23).
 */
export async function listPastFlightsForUser(
	db: RoomDatabase,
	userId: string,
	now = new Date(),
): Promise<PastFlightListing[]> {
	const oldestClose = new Date(now.getTime() - MESSAGE_RETENTION_MS);
	const rows = await db
		.select({ closesAt: flightRooms.closesAt, flight: flightListingColumns })
		.from(roomMemberships)
		.innerJoin(flightRooms, eq(roomMemberships.roomId, flightRooms.id))
		.innerJoin(flightInstances, eq(flightRooms.flightInstanceId, flightInstances.id))
		.where(
			and(
				eq(roomMemberships.userId, userId),
				lte(flightRooms.closesAt, now),
				gt(flightRooms.closesAt, oldestClose),
			),
		)
		.orderBy(desc(flightRooms.closesAt), asc(flightRooms.id))
		.limit(PAST_FLIGHTS_LIMIT);
	return rows.map((row) =>
		PastFlightListingSchema.parse({
			closedAt: row.closesAt.toISOString(),
			flight: flightFromJoinedRow(row.flight),
		}),
	);
}

export async function getRoomSnapshot(
	db: RoomDatabase,
	roomId: string,
	userId: string,
): Promise<RoomSnapshot> {
	const access = await getRoomAccessContext(db, roomId, userId);
	const member = await getPublicRoomMember(db, roomId, userId);
	if (!access || !member) {
		throw new Error("Nie należysz do tego pokoju.");
	}
	return RoomSnapshotSchema.parse({
		room: access.room,
		member,
		members: await listPublicRoomMembers(db, roomId),
		messages: await listRoomMessages(db, roomId, userId),
	});
}

export async function createConnectionTicket(
	db: RoomDatabase,
	input: CreateConnectionTicketInput,
): Promise<void> {
	await db.insert(roomConnectionTickets).values({
		...input,
		createdAt: input.createdAt ?? new Date(),
	});
}

export async function consumeConnectionTicket(
	db: RoomDatabase,
	input: { tokenHash: string; roomId: string; now?: Date },
): Promise<{ userId: string } | null> {
	const now = input.now ?? new Date();
	const [ticket] = await db
		.update(roomConnectionTickets)
		.set({ usedAt: now })
		.where(
			and(
				eq(roomConnectionTickets.tokenHash, input.tokenHash),
				eq(roomConnectionTickets.roomId, input.roomId),
				isNull(roomConnectionTickets.usedAt),
				gt(roomConnectionTickets.expiresAt, now),
			),
		)
		.returning({ userId: roomConnectionTickets.userId });
	return ticket ?? null;
}

export async function countRooms(db: RoomDatabase): Promise<number> {
	const [result] = await db.select({ total: count() }).from(flightRooms);
	return result?.total ?? 0;
}

export async function countRoomMemberships(db: RoomDatabase, roomId: string): Promise<number> {
	const [result] = await db
		.select({ total: count() })
		.from(roomMemberships)
		.where(eq(roomMemberships.roomId, roomId));
	return result?.total ?? 0;
}

export async function countRoomMessages(db: RoomDatabase, roomId: string): Promise<number> {
	const [result] = await db
		.select({ total: count() })
		.from(roomMessages)
		.where(eq(roomMessages.roomId, roomId));
	return result?.total ?? 0;
}
