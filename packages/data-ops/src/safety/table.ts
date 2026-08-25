import { sql } from "drizzle-orm";
import {
	index,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { auth_user } from "@/drizzle/auth-schema";
import { flightRooms, roomMessages } from "@/room/table";
import type { SafetyReportEvidence } from "./schema";

export const safetyReportReason = pgEnum("safety_report_reason", [
	"harassment_or_discrimination",
	"threats_or_impersonation",
	"money_or_private_information",
	"personal_data",
	"illegal_content",
	"commercial_spam",
	"other",
]);

export const safetyReportStatus = pgEnum("safety_report_status", ["open", "resolved"]);

export const communityRulesAcceptances = pgTable(
	"community_rules_acceptances",
	{
		userId: text("user_id")
			.notNull()
			.references(() => auth_user.id, { onDelete: "cascade" }),
		rulesVersion: text("rules_version").notNull(),
		acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.rulesVersion] })],
);

export const userBlocks = pgTable(
	"user_blocks",
	{
		blockerId: text("blocker_id")
			.notNull()
			.references(() => auth_user.id, { onDelete: "cascade" }),
		blockedId: text("blocked_id")
			.notNull()
			.references(() => auth_user.id, { onDelete: "cascade" }),
		blockedAt: timestamp("blocked_at", { withTimezone: true, mode: "date" }).notNull(),
		/**
		 * The whole of block state: NULL means the block is active, a timestamp means it
		 * was lifted then and messages created at or before it stay hidden. One field, so
		 * "lifted but still active" is unrepresentable rather than merely avoided.
		 */
		unblockedAt: timestamp("unblocked_at", { withTimezone: true, mode: "date" }),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.blockerId, table.blockedId] }),
		index("user_blocks_blocked_active_idx")
			.on(table.blockedId)
			.where(sql`${table.unblockedAt} is null`),
	],
);

export const safetyReports = pgTable(
	"safety_reports",
	{
		id: uuid("id").primaryKey(),
		roomId: uuid("room_id")
			.notNull()
			.references(() => flightRooms.id, { onDelete: "cascade" }),
		reporterId: text("reporter_id").references(() => auth_user.id, { onDelete: "set null" }),
		targetUserId: text("target_user_id").references(() => auth_user.id, { onDelete: "set null" }),
		messageId: uuid("message_id").references(() => roomMessages.id, { onDelete: "set null" }),
		reason: safetyReportReason("reason").notNull(),
		note: text("note"),
		status: safetyReportStatus("status").default("open").notNull(),
		evidenceSnapshot: jsonb("evidence_snapshot").$type<SafetyReportEvidence>(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
		// Audit trail for the triage decision. `set null` keeps a closed report
		// closed after the reviewing account is erased.
		resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
		resolvedBy: text("resolved_by").references(() => auth_user.id, { onDelete: "set null" }),
	},
	(table) => [
		uniqueIndex("safety_reports_member_retry_unique")
			.on(table.reporterId, table.targetUserId)
			.where(sql`${table.messageId} is null`),
		uniqueIndex("safety_reports_message_retry_unique")
			.on(table.reporterId, table.targetUserId, table.messageId)
			.where(sql`${table.messageId} is not null`),
		index("safety_reports_room_status_idx").on(table.roomId, table.status),
	],
);
