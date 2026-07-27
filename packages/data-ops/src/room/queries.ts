import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import type { getDb } from "@/database/setup";
import { auth_user } from "@/drizzle/auth-schema";
import {
	type PublicRoom,
	type PublicRoomMember,
	PublicRoomMemberSchema,
	type PublicRoomMessage,
	PublicRoomMessageSchema,
	PublicRoomSchema,
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

type RoomDatabase = Pick<ReturnType<typeof getDb>, "insert" | "select" | "update">;

export interface JoinFlightRoomInput {
	flightInstanceId: string;
	userId: string;
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

export interface CreateConnectionTicketInput {
	tokenHash: string;
	roomId: string;
	userId: string;
	expiresAt: Date;
	createdAt?: Date;
}

function roomFromRow(row: { id: string; flightInstanceId: string }): PublicRoom {
	return PublicRoomSchema.parse(row);
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
	pseudonym: string | null;
	content: string;
	createdAt: Date;
}): PublicRoomMessage {
	if (!row.pseudonym) {
		throw new Error("Autor wiadomości nie ma prawidłowego pseudonimu.");
	}
	return PublicRoomMessageSchema.parse({
		...row,
		pseudonym: row.pseudonym,
		createdAt: row.createdAt.toISOString(),
	});
}

async function findRoomByFlightInstance(
	db: RoomDatabase,
	flightInstanceId: string,
): Promise<PublicRoom | null> {
	const [row] = await db
		.select({ id: flightRooms.id, flightInstanceId: flightRooms.flightInstanceId })
		.from(flightRooms)
		.where(eq(flightRooms.flightInstanceId, flightInstanceId))
		.limit(1);
	return row ? roomFromRow(row) : null;
}

export async function getRoomById(db: RoomDatabase, roomId: string): Promise<PublicRoom | null> {
	const [row] = await db
		.select({ id: flightRooms.id, flightInstanceId: flightRooms.flightInstanceId })
		.from(flightRooms)
		.where(eq(flightRooms.id, roomId))
		.limit(1);
	return row ? roomFromRow(row) : null;
}

async function getMembership(
	db: RoomDatabase,
	roomId: string,
	userId: string,
): Promise<{ id: string; userId: string } | null> {
	const [row] = await db
		.select({ id: roomMemberships.id, userId: roomMemberships.userId })
		.from(roomMemberships)
		.where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId)))
		.limit(1);
	return row ?? null;
}

export async function joinFlightRoom(
	db: RoomDatabase,
	input: JoinFlightRoomInput,
): Promise<JoinFlightRoomResult> {
	const [insertedRoom] = await db
		.insert(flightRooms)
		.values({
			id: crypto.randomUUID(),
			flightInstanceId: input.flightInstanceId,
		})
		.onConflictDoNothing({ target: flightRooms.flightInstanceId })
		.returning({ id: flightRooms.id, flightInstanceId: flightRooms.flightInstanceId });
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
		})
		.from(roomMemberships)
		.innerJoin(flightRooms, eq(roomMemberships.roomId, flightRooms.id))
		.where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId)))
		.limit(1);
	if (!row) return null;
	return {
		room: roomFromRow({ id: row.roomId, flightInstanceId: row.flightInstanceId }),
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
): Promise<PublicRoomMessage[]> {
	const rows = await db
		.select({
			id: roomMessages.id,
			clientMessageId: roomMessages.clientMessageId,
			pseudonym: auth_user.pseudonym,
			content: roomMessages.content,
			createdAt: roomMessages.createdAt,
		})
		.from(roomMessages)
		.innerJoin(roomMemberships, eq(roomMessages.membershipId, roomMemberships.id))
		.innerJoin(auth_user, eq(roomMemberships.userId, auth_user.id))
		.where(eq(roomMessages.roomId, roomId))
		.orderBy(asc(roomMessages.sequence));
	return rows.map(messageFromRow);
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
			pseudonym: auth_user.pseudonym,
			content: roomMessages.content,
			createdAt: roomMessages.createdAt,
		})
		.from(roomMessages)
		.innerJoin(roomMemberships, eq(roomMessages.membershipId, roomMemberships.id))
		.innerJoin(auth_user, eq(roomMemberships.userId, auth_user.id))
		.where(and(eq(roomMessages.roomId, roomId), eq(roomMessages.clientMessageId, clientMessageId)))
		.limit(1);
	return row ? messageFromRow(row) : null;
}

export async function createRoomMessage(
	db: RoomDatabase,
	roomId: string,
	userId: string,
	input: RoomMessageCreateRequest,
): Promise<{ message: PublicRoomMessage; created: boolean }> {
	const messageInput = RoomMessageCreateRequestSchema.parse(input);
	const membership = await getMembership(db, roomId, userId);
	if (!membership) {
		throw new Error("Nie należysz do tego pokoju.");
	}
	const [inserted] = await db
		.insert(roomMessages)
		.values({
			id: crypto.randomUUID(),
			roomId,
			membershipId: membership.id,
			clientMessageId: messageInput.clientMessageId,
			content: messageInput.content,
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
		messages: await listRoomMessages(db, roomId),
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
