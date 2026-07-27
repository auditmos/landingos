import {
	bigserial,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { auth_user } from "@/drizzle/auth-schema";
import { flightInstances } from "@/flight/table";
import type { RoomSelection } from "./schema";

export const flightRooms = pgTable("flight_rooms", {
	id: uuid("id").primaryKey(),
	flightInstanceId: text("flight_instance_id")
		.notNull()
		.unique()
		.references(() => flightInstances.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const roomMemberships = pgTable(
	"room_memberships",
	{
		id: uuid("id").primaryKey(),
		roomId: uuid("room_id")
			.notNull()
			.references(() => flightRooms.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => auth_user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("room_memberships_room_user_unique").on(table.roomId, table.userId),
		index("room_memberships_room_idx").on(table.roomId),
	],
);

export const roomSelections = pgTable("room_selections", {
	membershipId: uuid("membership_id")
		.primaryKey()
		.references(() => roomMemberships.id, { onDelete: "cascade" }),
	selection: jsonb("selection").$type<RoomSelection>().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const roomMessages = pgTable(
	"room_messages",
	{
		id: uuid("id").primaryKey(),
		sequence: bigserial("sequence", { mode: "number" }).notNull(),
		roomId: uuid("room_id")
			.notNull()
			.references(() => flightRooms.id, { onDelete: "cascade" }),
		membershipId: uuid("membership_id")
			.notNull()
			.references(() => roomMemberships.id, { onDelete: "cascade" }),
		clientMessageId: uuid("client_message_id").notNull(),
		content: text("content").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("room_messages_room_client_unique").on(table.roomId, table.clientMessageId),
		index("room_messages_room_sequence_idx").on(table.roomId, table.sequence),
	],
);

export const roomConnectionTickets = pgTable(
	"room_connection_tickets",
	{
		tokenHash: text("token_hash").primaryKey(),
		roomId: uuid("room_id")
			.notNull()
			.references(() => flightRooms.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => auth_user.id, { onDelete: "cascade" }),
		expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
		usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
	},
	(table) => [index("room_connection_tickets_room_user_idx").on(table.roomId, table.userId)],
);
