import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const transferCatalogEntries = pgTable("transfer_catalog_entries", {
	id: text("id").primaryKey(),
	operatorName: text("operator_name").notNull(),
	serviceName: text("service_name").notNull(),
	originIata: text("origin_iata").notNull(),
	destinationStopCode: text("destination_stop_code").notNull(),
	destinationStopName: text("destination_stop_name").notNull(),
	durationMinutes: integer("duration_minutes").notNull(),
	transferCount: integer("transfer_count").notNull(),
	walkingMinutes: integer("walking_minutes").notNull(),
	walkingMeters: integer("walking_meters").notNull(),
	sourceUrl: text("source_url").notNull(),
	checkedAt: timestamp("checked_at", { withTimezone: true, mode: "date" }).notNull(),
	costMinorMin: integer("cost_minor_min").notNull(),
	costMinorMax: integer("cost_minor_max").notNull(),
	purchaseUrl: text("purchase_url").notNull(),
	publicationStatus: text("publication_status").notNull(),
	provenance: text("provenance").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
