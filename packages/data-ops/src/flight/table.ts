import { date, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const flightInstances = pgTable("flight_instances", {
	id: text("id").primaryKey(),
	canonicalKey: text("canonical_key").notNull().unique(),
	marketingCarrierCode: text("marketing_carrier_code").notNull(),
	marketingCarrierName: text("marketing_carrier_name").notNull(),
	marketingFlightNumber: text("marketing_flight_number").notNull(),
	operatingCarrierCode: text("operating_carrier_code"),
	operatingFlightNumber: text("operating_flight_number"),
	departureLocalDate: date("departure_local_date").notNull(),
	originIata: text("origin_iata").notNull(),
	destinationIata: text("destination_iata").notNull(),
	scheduledArrivalUtc: timestamp("scheduled_arrival_utc", {
		withTimezone: true,
		mode: "date",
	}).notNull(),
	displayTimezone: text("display_timezone").notNull(),
	source: text("source").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
