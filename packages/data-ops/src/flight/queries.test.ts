import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { countFlightInstances, getFlightInstance, upsertFlightInstance } from "./queries";

async function createTestDatabase() {
	const client = new PGlite();
	const migration = readFileSync(
		resolve(import.meta.dirname, "../drizzle/migrations/dev/0003_flimsy_dorian_gray.sql"),
		"utf8",
	);
	await client.exec(migration);
	return {
		client,
		db: drizzle(client) as unknown as Parameters<typeof upsertFlightInstance>[0],
	};
}

function providerFlight(overrides: Record<string, unknown> = {}) {
	return {
		id: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
		canonicalKey: "provider:operating-flight-2026-09-14",
		marketingCarrierCode: "FR",
		marketingCarrierName: "Ryanair",
		marketingFlightNumber: "1234",
		operatingCarrierCode: "FR",
		operatingFlightNumber: "1234",
		departureLocalDate: "2026-09-14",
		originIata: "WAW",
		destinationIata: "BGY" as const,
		scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
		displayTimezone: "Europe/Rome" as const,
		source: "provider" as const,
		...overrides,
	};
}

describe("flight instance persistence", () => {
	it("upserts two codeshares with one canonical identity into one row", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const first = await upsertFlightInstance(db, providerFlight());
			const second = await upsertFlightInstance(
				db,
				providerFlight({
					marketingCarrierCode: "W6",
					marketingCarrierName: "Wizz Air",
					marketingFlightNumber: "9000",
				}),
			);
			expect(second.id).toBe(first.id);
			expect(await countFlightInstances(db)).toBe(1);
		} finally {
			await client.close();
		}
	});

	it("persists the same flight number on two dates as distinct rows", async () => {
		const { client, db } = await createTestDatabase();
		try {
			await upsertFlightInstance(db, providerFlight());
			await upsertFlightInstance(
				db,
				providerFlight({
					id: "018f51b4-c697-74ab-820f-d9e72852a52c",
					canonicalKey: "provider:operating-flight-2026-09-15",
					departureLocalDate: "2026-09-15",
					scheduledArrivalUtc: "2026-09-15T08:20:00.000Z",
				}),
			);
			expect(await countFlightInstances(db)).toBe(2);
		} finally {
			await client.close();
		}
	});

	it("replays identical manual input idempotently and returns a public-safe record", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const manual = providerFlight({
				id: "018f4c8e-5697-7df4-8f6e-c7644b137e5c",
				canonicalKey: "manual:fr1234:2026-09-14:bgy:2026-09-14T08:20:00.000Z",
				operatingCarrierCode: null,
				operatingFlightNumber: null,
				source: "manual",
			});
			const first = await upsertFlightInstance(db, manual);
			const second = await upsertFlightInstance(db, manual);
			expect(second).toEqual(first);
			expect(await countFlightInstances(db)).toBe(1);
			expect(await getFlightInstance(db, first.id)).toEqual(first);
			expect(first).not.toHaveProperty("canonicalKey");
		} finally {
			await client.close();
		}
	});
});
