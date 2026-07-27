import { index, pgEnum, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { ANALYTICS_EVENT_NAMES, ANALYTICS_FUNNEL_STEPS, type AnalyticsFunnelStep } from "./schema";

export const analyticsEventName = pgEnum("analytics_event_name", ANALYTICS_EVENT_NAMES);
export const analyticsFunnelStep = pgEnum("analytics_funnel_step", ANALYTICS_FUNNEL_STEPS);
export const analyticsFunnelStatus = pgEnum("analytics_funnel_status", [
	"active",
	"completed",
	"abandoned",
]);
export const analyticsTransportKind = pgEnum("analytics_transport_kind", [
	"public_transport",
	"shared_taxi",
]);
export const analyticsRoomOccupancyBucket = pgEnum("analytics_room_occupancy_bucket", [
	"one",
	"two_to_five",
	"six_plus",
]);

export const analyticsFunnels = pgTable(
	"analytics_funnels",
	{
		id: text("id").primaryKey(),
		status: analyticsFunnelStatus("status").default("active").notNull(),
		lastCompletedStep: analyticsFunnelStep("last_completed_step")
			.$type<AnalyticsFunnelStep>()
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
		lastActivityAt: timestamp("last_activity_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
	},
	(table) => [
		index("analytics_funnels_status_activity_idx").on(table.status, table.lastActivityAt),
	],
);

export const analyticsEvents = pgTable(
	"analytics_events",
	{
		eventName: analyticsEventName("event_name").notNull(),
		eventTime: timestamp("event_time", { withTimezone: true, mode: "date" }).notNull(),
		funnelId: text("funnel_id")
			.notNull()
			.references(() => analyticsFunnels.id, { onDelete: "cascade" }),
		actorPseudonym: text("actor_pseudonym"),
		lastCompletedStep: analyticsFunnelStep("last_completed_step")
			.$type<AnalyticsFunnelStep>()
			.notNull(),
		transportKind: analyticsTransportKind("transport_kind"),
		roomOccupancyBucket: analyticsRoomOccupancyBucket("room_occupancy_bucket"),
		schemaVersion: text("schema_version").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.funnelId, table.eventName] }),
		index("analytics_events_name_time_idx").on(table.eventName, table.eventTime),
	],
);
