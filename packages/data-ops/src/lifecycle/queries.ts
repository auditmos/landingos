import { and, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import type { getDb } from "@/database/setup";
import { auth_verification } from "@/drizzle/auth-schema";
import type { RoomDatabase } from "@/room";
import { flightRooms, roomMemberships, roomMessages, roomSelections } from "@/room/table";
import { safetyReports } from "@/safety/table";
import {
	ACCOUNT_MESSAGE_TOMBSTONE,
	ACCOUNT_PSEUDONYM_TOMBSTONE,
	LIFECYCLE_CLEANUP_BATCH_SIZE,
	MESSAGE_RETENTION_MS,
	ROOM_ACCESS_WINDOW_MS,
} from "./constants";

export {
	ACCOUNT_MESSAGE_TOMBSTONE,
	ACCOUNT_PSEUDONYM_TOMBSTONE,
	LIFECYCLE_CLEANUP_BATCH_SIZE,
	MESSAGE_RETENTION_MS,
	ROOM_ACCESS_WINDOW_MS,
};

export type LifecycleDatabase = RoomDatabase &
	Pick<ReturnType<typeof getDb>, "delete" | "selectDistinct" | "transaction">;

export interface LifecycleCleanupResult {
	roomsScanned: number;
	messagesPurged: number;
	snapshotsPurged: number;
	hasMore: boolean;
}

export async function purgeExpiredRoomContent(
	db: LifecycleDatabase,
	input: { now: Date; batchSize?: number },
): Promise<LifecycleCleanupResult> {
	const batchSize = input.batchSize ?? LIFECYCLE_CLEANUP_BATCH_SIZE;
	if (!Number.isInteger(batchSize) || batchSize < 1) {
		throw new Error("Rozmiar partii czyszczenia musi być dodatnią liczbą całkowitą.");
	}
	const candidates = await db
		.selectDistinct({ roomId: flightRooms.id })
		.from(flightRooms)
		.leftJoin(roomMessages, eq(roomMessages.roomId, flightRooms.id))
		.leftJoin(safetyReports, eq(safetyReports.roomId, flightRooms.id))
		.where(
			and(
				lte(flightRooms.messagePurgeAt, input.now),
				or(isNotNull(roomMessages.content), isNotNull(safetyReports.evidenceSnapshot)),
			),
		)
		.orderBy(flightRooms.id)
		.limit(batchSize + 1);
	const roomIds = candidates.slice(0, batchSize).map((row) => row.roomId);
	if (roomIds.length === 0) {
		return {
			roomsScanned: 0,
			messagesPurged: 0,
			snapshotsPurged: 0,
			hasMore: false,
		};
	}
	return db.transaction(async (tx) => {
		const purgedMessages = await tx
			.update(roomMessages)
			.set({ content: null, contentPurgedAt: input.now })
			.where(and(inArray(roomMessages.roomId, roomIds), isNotNull(roomMessages.content)))
			.returning({ id: roomMessages.id });
		const purgedSnapshots = await tx
			.update(safetyReports)
			.set({ evidenceSnapshot: null })
			.where(and(inArray(safetyReports.roomId, roomIds), isNotNull(safetyReports.evidenceSnapshot)))
			.returning({ id: safetyReports.id });
		return {
			roomsScanned: roomIds.length,
			messagesPurged: purgedMessages.length,
			snapshotsPurged: purgedSnapshots.length,
			hasMore: candidates.length > batchSize,
		};
	});
}

export interface AccountDeletionRoom {
	roomId: string;
	coordinatorKey: string;
}

export async function prepareAccountDeletion(
	db: LifecycleDatabase,
	input: { userId: string; email: string; now: Date },
): Promise<{ rooms: AccountDeletionRoom[] }> {
	return db.transaction(async (tx) => {
		const rooms = await tx
			.select({
				roomId: flightRooms.id,
				coordinatorKey: flightRooms.flightInstanceId,
			})
			.from(roomMemberships)
			.innerJoin(flightRooms, eq(roomMemberships.roomId, flightRooms.id))
			.where(eq(roomMemberships.userId, input.userId));
		const memberships = await tx
			.select({ id: roomMemberships.id })
			.from(roomMemberships)
			.where(eq(roomMemberships.userId, input.userId));
		const membershipIds = memberships.map((row) => row.id);
		const messages =
			membershipIds.length === 0
				? []
				: await tx
						.select({ id: roomMessages.id })
						.from(roomMessages)
						.where(inArray(roomMessages.membershipId, membershipIds));
		const messageIds = messages.map((row) => row.id);

		if (messageIds.length > 0) {
			await tx
				.update(safetyReports)
				.set({
					evidenceSnapshot: sql`CASE
						WHEN ${safetyReports.evidenceSnapshot} IS NULL THEN NULL
						ELSE jsonb_set(
							${safetyReports.evidenceSnapshot},
							'{authorPseudonym}',
							${JSON.stringify(ACCOUNT_PSEUDONYM_TOMBSTONE)}::jsonb
						)
					END`,
				})
				.where(inArray(safetyReports.messageId, messageIds));
			await tx
				.update(roomMessages)
				.set({
					membershipId: null,
					authorPseudonym: ACCOUNT_PSEUDONYM_TOMBSTONE,
					content: ACCOUNT_MESSAGE_TOMBSTONE,
					tombstonedAt: input.now,
				})
				.where(inArray(roomMessages.id, messageIds));
		}
		await tx
			.update(safetyReports)
			.set({ reporterId: null })
			.where(eq(safetyReports.reporterId, input.userId));
		await tx
			.update(safetyReports)
			.set({ targetUserId: null })
			.where(eq(safetyReports.targetUserId, input.userId));
		if (membershipIds.length > 0) {
			await tx.delete(roomSelections).where(inArray(roomSelections.membershipId, membershipIds));
			await tx.delete(roomMemberships).where(inArray(roomMemberships.id, membershipIds));
		}
		await tx.delete(auth_verification).where(eq(auth_verification.identifier, input.email));
		return {
			rooms: Array.from(new Map(rooms.map((room) => [room.roomId, room] as const)).values()),
		};
	});
}
