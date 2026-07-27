import { count, eq } from "drizzle-orm";
import type { getDb } from "@/database/setup";
import { type FlightInstance, FlightInstanceSchema, type FlightInstanceWrite } from "./schema";
import { flightInstances } from "./table";

type FlightDatabase = Pick<ReturnType<typeof getDb>, "insert" | "select">;

const publicSelection = {
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

function toFlightInstance(row: {
	id: string;
	marketingCarrierCode: string;
	marketingCarrierName: string;
	marketingFlightNumber: string;
	operatingCarrierCode: string | null;
	operatingFlightNumber: string | null;
	departureLocalDate: string;
	originIata: string;
	destinationIata: string;
	scheduledArrivalUtc: Date;
	displayTimezone: string;
	source: string;
}): FlightInstance {
	return FlightInstanceSchema.parse({
		...row,
		scheduledArrivalUtc: row.scheduledArrivalUtc.toISOString(),
	});
}

export async function upsertFlightInstance(
	db: FlightDatabase,
	input: FlightInstanceWrite,
): Promise<FlightInstance> {
	const { canonicalKey, scheduledArrivalUtc, ...flight } = input;
	const [row] = await db
		.insert(flightInstances)
		.values({
			...flight,
			canonicalKey,
			scheduledArrivalUtc: new Date(scheduledArrivalUtc),
		})
		.onConflictDoUpdate({
			target: flightInstances.canonicalKey,
			set: {
				marketingCarrierCode: flight.marketingCarrierCode,
				marketingCarrierName: flight.marketingCarrierName,
				marketingFlightNumber: flight.marketingFlightNumber,
				operatingCarrierCode: flight.operatingCarrierCode,
				operatingFlightNumber: flight.operatingFlightNumber,
				updatedAt: new Date(),
			},
		})
		.returning(publicSelection);
	if (!row) {
		throw new Error("Nie udało się zapisać instancji lotu.");
	}
	return toFlightInstance(row);
}

export async function getFlightInstance(
	db: FlightDatabase,
	id: string,
): Promise<FlightInstance | null> {
	const [row] = await db
		.select(publicSelection)
		.from(flightInstances)
		.where(eq(flightInstances.id, id))
		.limit(1);
	return row ? toFlightInstance(row) : null;
}

export async function countFlightInstances(db: FlightDatabase): Promise<number> {
	const [result] = await db.select({ total: count() }).from(flightInstances);
	return result?.total ?? 0;
}
