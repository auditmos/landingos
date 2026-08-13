import type { TransferCatalogDraftInput, TransferCatalogRecord } from "@repo/data-ops/journey";
import { type CatalogRepository, createCatalogService } from "./catalog-service";

const now = new Date("2026-07-27T12:00:00.000Z");

// Issue #18 atomic publish assumptions before RED:
// - The command receives all 13 editable values currently shown in the form.
// - Existing saved values are not merged into a partial publish submission.
// - Validation failure performs no write; success performs one repository write and returns it.
// - Exact now and exactly 30 days old are valid UTC instants; any future instant is invalid.
const completeInput: TransferCatalogDraftInput = {
	operatorName: "Terravision",
	serviceName: "BGY → Milano Centrale",
	destinationStopCode: "milano-centrale",
	destinationStopName: "Milano Centrale",
	durationMinutes: 50,
	transferCount: 0,
	walkingMinutes: 0,
	walkingMeters: 0,
	sourceUrl: "https://www.terravision.eu/airport_transfer/bus-bergamo-airport-milan/",
	checkedAt: now.toISOString(),
	costMinorMin: 500,
	costMinorMax: 1_000,
	purchaseUrl: "https://www.flixbus.com/bus-routes/bus-bergamo-orio-al-serio-airport-milan",
};

function record(overrides: Partial<TransferCatalogRecord> = {}): TransferCatalogRecord {
	return {
		id: "catalog-id",
		originIata: "BGY",
		operatorName: null,
		serviceName: null,
		destinationStopCode: null,
		destinationStopName: null,
		durationMinutes: null,
		transferCount: null,
		walkingMinutes: null,
		walkingMeters: null,
		sourceUrl: null,
		checkedAt: null,
		costMinorMin: null,
		costMinorMax: null,
		purchaseUrl: null,
		publicationStatus: "draft",
		provenance: "operator_verified",
		freshness: "incomplete",
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
		...overrides,
	};
}

function repository(initial = record()): CatalogRepository {
	let current: TransferCatalogRecord | null = initial;
	return {
		list: async () => (current ? [current] : []),
		get: async () => current,
		create: async () => current as TransferCatalogRecord,
		update: async (_id, input) => {
			current = current ? { ...current, ...input } : null;
			return current;
		},
		saveAndPublish: async (_id, input) => {
			current = current
				? { ...current, ...input, publicationStatus: "published", freshness: "fresh" }
				: null;
			return current;
		},
		setPublicationStatus: async (_id, status) => {
			current = current ? { ...current, publicationStatus: status } : null;
			return current;
		},
		delete: async () => {
			const existed = Boolean(current);
			current = null;
			return existed;
		},
	};
}

describe("operator catalog service", () => {
	it("publishes all current form values through one repository write", async () => {
		const saveAndPublish = vi.fn(async (_id: string | null, input: TransferCatalogDraftInput) =>
			record({ ...input, publicationStatus: "published", freshness: "fresh" }),
		);
		const repo = Object.assign(repository(record({ operatorName: "Stary zapis" })), {
			saveAndPublish,
		});
		const service = createCatalogService(repo, { now: () => now, freshnessDays: 30 });

		const result = await service.saveAndPublish("catalog-id", completeInput);

		expect(saveAndPublish).toHaveBeenCalledTimes(1);
		expect(saveAndPublish).toHaveBeenCalledWith("catalog-id", completeInput, {
			now,
			freshnessDays: 30,
		});
		expect(result).toMatchObject({
			ok: true,
			data: { ...completeInput, publicationStatus: "published" },
		});
	});

	it("returns field-specific validation errors without publishing an incomplete draft", async () => {
		const repo = repository();
		const service = createCatalogService(repo, { now: () => now, freshnessDays: 30 });
		const result = await service.publish("catalog-id");
		expect(result).toMatchObject({
			ok: false,
			reason: "validation_error",
			fieldErrors: {
				operatorName: expect.stringContaining("nazwę"),
				checkedAt: expect.stringContaining("datę"),
				purchaseUrl: expect.stringContaining("łącze"),
			},
		});
		expect((await repo.get("catalog-id", { now }))?.publicationStatus).toBe("draft");
	});

	it("publishes a complete fresh draft and returns not found for absent records", async () => {
		const repo = repository(
			record({
				operatorName: "Airport Bus Express",
				serviceName: "BGY → Milano Centrale",
				destinationStopCode: "milano-centrale",
				destinationStopName: "Milano Centrale",
				durationMinutes: 50,
				transferCount: 0,
				walkingMinutes: 0,
				walkingMeters: 0,
				sourceUrl: "https://www.milanbergamoairport.it/en/bus/",
				checkedAt: "2026-07-27T00:00:00.000Z",
				costMinorMin: 1_000,
				costMinorMax: 1_200,
				purchaseUrl: "https://www.airportbusexpress.it/tickets",
				freshness: "fresh",
			}),
		);
		const service = createCatalogService(repo, { now: () => now, freshnessDays: 30 });
		expect(await service.publish("catalog-id")).toMatchObject({
			ok: true,
			data: { publicationStatus: "published" },
		});
		await repo.delete("catalog-id");
		expect(await service.publish("catalog-id")).toEqual({ ok: false, reason: "not_found" });
	});

	it("rejects an invalid direct edit of a published entry but allows a fresh check-date update", async () => {
		const repo = repository(
			record({
				operatorName: "Airport Bus Express",
				serviceName: "BGY → Milano Centrale",
				destinationStopCode: "milano-centrale",
				destinationStopName: "Milano Centrale",
				durationMinutes: 50,
				transferCount: 0,
				walkingMinutes: 0,
				walkingMeters: 0,
				sourceUrl: "https://www.milanbergamoairport.it/en/bus/",
				checkedAt: "2026-07-27T00:00:00.000Z",
				costMinorMin: 1_000,
				costMinorMax: 1_200,
				purchaseUrl: "https://www.airportbusexpress.it/tickets",
				publicationStatus: "published",
				freshness: "fresh",
			}),
		);
		const service = createCatalogService(repo, { now: () => now, freshnessDays: 30 });
		expect(await service.update("catalog-id", { sourceUrl: "https://evil.example" })).toMatchObject(
			{
				ok: false,
				reason: "validation_error",
				fieldErrors: { sourceUrl: expect.any(String) },
			},
		);
		expect((await repo.get("catalog-id", { now }))?.sourceUrl).not.toContain("evil.example");
		expect(
			await service.update("catalog-id", { checkedAt: "2026-07-27T12:00:00.000Z" }),
		).toMatchObject({
			ok: true,
			data: { publicationStatus: "published", checkedAt: "2026-07-27T12:00:00.000Z" },
		});
	});
});
