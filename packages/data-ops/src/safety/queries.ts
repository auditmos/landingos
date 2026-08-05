import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { auth_user } from "@/drizzle/auth-schema";
import { flightInstances } from "@/flight/table";
import type { RoomDatabase } from "@/room/queries";
import { getRoomAccessContext } from "@/room/queries";
import { flightRooms, roomMemberships, roomMessages } from "@/room/table";
import {
	type SafetyReportCreateRequest,
	SafetyReportCreateRequestSchema,
	type SafetyReportEvidence,
	SafetyReportEvidenceSchema,
	type SafetyReportQueueQuery,
	SafetyReportQueueQuerySchema,
	type SafetyReportQueueResponse,
	SafetyReportQueueResponseSchema,
	type SafetyReportRecord,
	SafetyReportRecordSchema,
} from "./schema";
import { communityRulesAcceptances, safetyReports, userBlocks } from "./table";

export class SafetyQueryError extends Error {
	constructor(readonly code: "ROOM_ACCESS_DENIED" | "SAFETY_TARGET_INVALID") {
		super(
			code === "ROOM_ACCESS_DENIED"
				? "Nie należysz do tego pokoju."
				: "Nie można wykonać tej operacji dla wskazanej osoby lub wiadomości.",
		);
		this.name = "SafetyQueryError";
	}
}

interface RoomTarget {
	userId: string;
	pseudonym: string;
}

async function roomTargetByPseudonym(
	db: RoomDatabase,
	roomId: string,
	pseudonym: string,
): Promise<RoomTarget | null> {
	const [target] = await db
		.select({ userId: roomMemberships.userId, pseudonym: auth_user.pseudonym })
		.from(roomMemberships)
		.innerJoin(auth_user, eq(roomMemberships.userId, auth_user.id))
		.where(and(eq(roomMemberships.roomId, roomId), eq(auth_user.pseudonym, pseudonym)))
		.limit(1);
	return target?.pseudonym ? { userId: target.userId, pseudonym: target.pseudonym } : null;
}

async function authorizedTarget(
	db: RoomDatabase,
	roomId: string,
	actorId: string,
	pseudonym: string,
): Promise<RoomTarget> {
	if (!(await getRoomAccessContext(db, roomId, actorId))) {
		throw new SafetyQueryError("ROOM_ACCESS_DENIED");
	}
	const target = await roomTargetByPseudonym(db, roomId, pseudonym);
	if (!target || target.userId === actorId) {
		throw new SafetyQueryError("SAFETY_TARGET_INVALID");
	}
	return target;
}

export async function acceptCommunityRules(
	db: RoomDatabase,
	input: { userId: string; rulesVersion: string; acceptedAt?: Date },
) {
	const acceptedAt = input.acceptedAt ?? new Date();
	const [inserted] = await db
		.insert(communityRulesAcceptances)
		.values({ ...input, acceptedAt })
		.onConflictDoNothing({
			target: [communityRulesAcceptances.userId, communityRulesAcceptances.rulesVersion],
		})
		.returning({ acceptedAt: communityRulesAcceptances.acceptedAt });
	const [acceptance] = inserted
		? [inserted]
		: await db
				.select({ acceptedAt: communityRulesAcceptances.acceptedAt })
				.from(communityRulesAcceptances)
				.where(
					and(
						eq(communityRulesAcceptances.userId, input.userId),
						eq(communityRulesAcceptances.rulesVersion, input.rulesVersion),
					),
				)
				.limit(1);
	if (!acceptance) throw new Error("Nie udało się zapisać akceptacji zasad.");
	return {
		acceptance: {
			userId: input.userId,
			rulesVersion: input.rulesVersion,
			acceptedAt: acceptance.acceptedAt,
		},
		created: Boolean(inserted),
	};
}

export async function hasCommunityRulesAcceptance(
	db: RoomDatabase,
	userId: string,
	rulesVersion: string,
): Promise<boolean> {
	const [acceptance] = await db
		.select({ userId: communityRulesAcceptances.userId })
		.from(communityRulesAcceptances)
		.where(
			and(
				eq(communityRulesAcceptances.userId, userId),
				eq(communityRulesAcceptances.rulesVersion, rulesVersion),
			),
		)
		.limit(1);
	return Boolean(acceptance);
}

export async function countCommunityRulesAcceptances(
	db: RoomDatabase,
	userId: string,
): Promise<number> {
	const [result] = await db
		.select({ total: count() })
		.from(communityRulesAcceptances)
		.where(eq(communityRulesAcceptances.userId, userId));
	return result?.total ?? 0;
}

export async function blockRoomMember(
	db: RoomDatabase,
	input: { roomId: string; blockerId: string; targetPseudonym: string; now?: Date },
) {
	const target = await authorizedTarget(db, input.roomId, input.blockerId, input.targetPseudonym);
	const now = input.now ?? new Date();
	const [inserted] = await db
		.insert(userBlocks)
		.values({
			blockerId: input.blockerId,
			blockedId: target.userId,
			active: true,
			blockedAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({ target: [userBlocks.blockerId, userBlocks.blockedId] })
		.returning({ blockerId: userBlocks.blockerId });
	let reactivated = false;
	if (!inserted) {
		const updated = await db
			.update(userBlocks)
			.set({ active: true, blockedAt: now, updatedAt: now })
			.where(
				and(
					eq(userBlocks.blockerId, input.blockerId),
					eq(userBlocks.blockedId, target.userId),
					eq(userBlocks.active, false),
				),
			)
			.returning({ blockerId: userBlocks.blockerId });
		reactivated = updated.length > 0;
	}
	return {
		blockedPseudonym: target.pseudonym,
		created: Boolean(inserted),
		changed: Boolean(inserted) || reactivated,
	};
}

export async function unblockRoomMember(
	db: RoomDatabase,
	input: { roomId: string; blockerId: string; targetPseudonym: string; now?: Date },
) {
	const target = await authorizedTarget(db, input.roomId, input.blockerId, input.targetPseudonym);
	const now = input.now ?? new Date();
	const changed = await db
		.update(userBlocks)
		.set({ active: false, hiddenThrough: now, updatedAt: now })
		.where(
			and(
				eq(userBlocks.blockerId, input.blockerId),
				eq(userBlocks.blockedId, target.userId),
				eq(userBlocks.active, true),
			),
		)
		.returning({ blockerId: userBlocks.blockerId });
	return { blockedPseudonym: target.pseudonym, changed: changed.length > 0 };
}

export async function listBlockedMemberPseudonyms(
	db: RoomDatabase,
	roomId: string,
	blockerId: string,
): Promise<string[]> {
	if (!(await getRoomAccessContext(db, roomId, blockerId))) {
		throw new SafetyQueryError("ROOM_ACCESS_DENIED");
	}
	const rows = await db
		.select({ pseudonym: auth_user.pseudonym })
		.from(userBlocks)
		.innerJoin(auth_user, eq(userBlocks.blockedId, auth_user.id))
		.innerJoin(
			roomMemberships,
			and(eq(roomMemberships.userId, userBlocks.blockedId), eq(roomMemberships.roomId, roomId)),
		)
		.where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.active, true)))
		.orderBy(asc(auth_user.pseudonym));
	return rows.flatMap((row) => (row.pseudonym ? [row.pseudonym] : []));
}

export async function listBlockedRecipientIds(
	db: RoomDatabase,
	roomId: string,
	sourceUserId: string,
): Promise<string[]> {
	const rows = await db
		.select({ blockerId: userBlocks.blockerId })
		.from(userBlocks)
		.innerJoin(
			roomMemberships,
			and(eq(roomMemberships.userId, userBlocks.blockerId), eq(roomMemberships.roomId, roomId)),
		)
		.where(and(eq(userBlocks.blockedId, sourceUserId), eq(userBlocks.active, true)));
	return rows.map((row) => row.blockerId);
}

async function messageTarget(
	db: RoomDatabase,
	roomId: string,
	messageId: string,
): Promise<RoomTarget & { messageId: string; content: string; createdAt: Date }> {
	const [message] = await db
		.select({
			messageId: roomMessages.id,
			userId: roomMemberships.userId,
			pseudonym: auth_user.pseudonym,
			content: roomMessages.content,
			createdAt: roomMessages.createdAt,
		})
		.from(roomMessages)
		.innerJoin(roomMemberships, eq(roomMessages.membershipId, roomMemberships.id))
		.innerJoin(auth_user, eq(roomMemberships.userId, auth_user.id))
		.where(and(eq(roomMessages.roomId, roomId), eq(roomMessages.id, messageId)))
		.limit(1);
	if (!message?.pseudonym || message.content === null) {
		throw new SafetyQueryError("SAFETY_TARGET_INVALID");
	}
	return { ...message, pseudonym: message.pseudonym, content: message.content };
}

function reportFromRow(row: {
	id: string;
	roomId: string;
	reporterId: string | null;
	targetUserId: string | null;
	messageId: string | null;
	reason: SafetyReportRecord["reason"];
	note: string | null;
	status: "open";
	evidenceSnapshot: unknown;
	createdAt: Date;
}): SafetyReportRecord {
	return SafetyReportRecordSchema.parse({
		...row,
		evidenceSnapshot:
			row.evidenceSnapshot === null ? null : SafetyReportEvidenceSchema.parse(row.evidenceSnapshot),
		createdAt: row.createdAt.toISOString(),
	});
}

export async function createSafetyReport(
	db: RoomDatabase,
	input: {
		roomId: string;
		reporterId: string;
		request: SafetyReportCreateRequest;
		createdAt?: Date;
	},
): Promise<{ report: SafetyReportRecord; created: boolean }> {
	if (!(await getRoomAccessContext(db, input.roomId, input.reporterId))) {
		throw new SafetyQueryError("ROOM_ACCESS_DENIED");
	}
	const request = SafetyReportCreateRequestSchema.parse(input.request);
	let target: RoomTarget;
	let messageId: string | null = null;
	let evidenceSnapshot: SafetyReportEvidence | null = null;
	if (request.targetType === "member") {
		target = await authorizedTarget(db, input.roomId, input.reporterId, request.targetPseudonym);
	} else {
		const message = await messageTarget(db, input.roomId, request.messageId);
		target = message;
		messageId = message.messageId;
		evidenceSnapshot = SafetyReportEvidenceSchema.parse({
			messageText: message.content,
			authorPseudonym: message.pseudonym,
			originalMessageAt: message.createdAt.toISOString(),
		});
		if (target.userId === input.reporterId) {
			throw new SafetyQueryError("SAFETY_TARGET_INVALID");
		}
	}
	const createdAt = input.createdAt ?? new Date();
	const [inserted] = await db
		.insert(safetyReports)
		.values({
			id: crypto.randomUUID(),
			roomId: input.roomId,
			reporterId: input.reporterId,
			targetUserId: target.userId,
			messageId,
			reason: request.reason,
			note: request.note || null,
			status: "open",
			evidenceSnapshot,
			createdAt,
		})
		.onConflictDoNothing()
		.returning({ id: safetyReports.id });
	const conditions = [
		eq(safetyReports.reporterId, input.reporterId),
		eq(safetyReports.targetUserId, target.userId),
		messageId === null ? isNull(safetyReports.messageId) : eq(safetyReports.messageId, messageId),
	];
	const [row] = await db
		.select()
		.from(safetyReports)
		.where(and(...conditions))
		.limit(1);
	if (!row) throw new Error("Nie udało się zapisać zgłoszenia.");
	return { report: reportFromRow(row), created: Boolean(inserted) };
}

const reporterAccount = alias(auth_user, "reporter_account");
const targetAccount = alias(auth_user, "target_account");

/**
 * Triage queue for the operator console, newest first. Reads one row past the
 * requested page so the caller learns whether more reports exist without a
 * second count query. Accounts erased by the deletion flow surface as `null`
 * pseudonyms rather than disappearing — an open report must stay reviewable
 * even after either side leaves.
 */
export async function listSafetyReportQueue(
	db: RoomDatabase,
	query: SafetyReportQueueQuery = {},
): Promise<SafetyReportQueueResponse> {
	const { reason, limit, offset } = SafetyReportQueueQuerySchema.parse(query);
	const rows = await db
		.select({
			id: safetyReports.id,
			roomId: safetyReports.roomId,
			carrierCode: flightInstances.marketingCarrierCode,
			flightNumber: flightInstances.marketingFlightNumber,
			departureLocalDate: flightInstances.departureLocalDate,
			reporterPseudonym: reporterAccount.pseudonym,
			targetPseudonym: targetAccount.pseudonym,
			messageId: safetyReports.messageId,
			reason: safetyReports.reason,
			note: safetyReports.note,
			status: safetyReports.status,
			evidenceSnapshot: safetyReports.evidenceSnapshot,
			createdAt: safetyReports.createdAt,
		})
		.from(safetyReports)
		.innerJoin(flightRooms, eq(safetyReports.roomId, flightRooms.id))
		.innerJoin(flightInstances, eq(flightRooms.flightInstanceId, flightInstances.id))
		.leftJoin(reporterAccount, eq(safetyReports.reporterId, reporterAccount.id))
		.leftJoin(targetAccount, eq(safetyReports.targetUserId, targetAccount.id))
		.where(reason ? eq(safetyReports.reason, reason) : undefined)
		.orderBy(desc(safetyReports.createdAt), desc(safetyReports.id))
		.limit(limit + 1)
		.offset(offset);
	return SafetyReportQueueResponseSchema.parse({
		reports: rows.slice(0, limit).map((row) => ({
			id: row.id,
			roomId: row.roomId,
			flightDesignator: `${row.carrierCode}${row.flightNumber}`,
			departureLocalDate: row.departureLocalDate,
			reporterPseudonym: row.reporterPseudonym,
			targetPseudonym: row.targetPseudonym,
			messageId: row.messageId,
			reason: row.reason,
			note: row.note,
			status: row.status,
			evidenceSnapshot: row.evidenceSnapshot,
			createdAt: row.createdAt.toISOString(),
		})),
		hasMore: rows.length > limit,
	});
}

export async function countSafetyReports(db: RoomDatabase): Promise<number> {
	const [result] = await db.select({ total: count() }).from(safetyReports);
	return result?.total ?? 0;
}
