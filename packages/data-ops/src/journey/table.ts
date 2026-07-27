import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const transferCatalogEntries = pgTable("transfer_catalog_entries", {
	id: text("id").primaryKey(),
	operatorName: text("operator_name"),
	serviceName: text("service_name"),
	originIata: text("origin_iata").default("BGY").notNull(),
	destinationStopCode: text("destination_stop_code"),
	destinationStopName: text("destination_stop_name"),
	durationMinutes: integer("duration_minutes"),
	transferCount: integer("transfer_count"),
	walkingMinutes: integer("walking_minutes"),
	walkingMeters: integer("walking_meters"),
	sourceUrl: text("source_url"),
	checkedAt: timestamp("checked_at", { withTimezone: true, mode: "date" }),
	costMinorMin: integer("cost_minor_min"),
	costMinorMax: integer("cost_minor_max"),
	purchaseUrl: text("purchase_url"),
	publicationStatus: text("publication_status").default("draft").notNull(),
	provenance: text("provenance").default("operator_verified").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
