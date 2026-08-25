import type {
	JourneyRecommendationResult,
	PublishedTransferCatalogEntry,
	TransferCatalogEditableField,
} from "@repo/data-ops/journey";
import { describe, expect, it } from "vitest";
import type { ProviderResult, TransitProvider, TransitRoute } from "../providers";
import { recommendJourneys, type TransferCatalogRepository } from "./engine";

/*
 * Issue #21: no publication-required catalog value may be write-only. Each of the 13
 * fields must change a documented downstream consumer, and the manually verified
 * transfer facts must never overwrite a provider-derived end-to-end route.
 */

const request = {
	flightInstanceId: "flight-1",
	scheduledArrivalUtc: "2026-08-13T08:20:00.000Z",
	privateDestinationCoordinates: { latitude: 45.464098, longitude: 9.191926 },
	bufferMinutes: 45,
};

function entry(
	overrides: Partial<PublishedTransferCatalogEntry> = {},
): PublishedTransferCatalogEntry {
	return {
		id: "catalog-1",
		operatorName: "Terravision",
		serviceName: "BGY → Milano Centrale",
		originIata: "BGY",
		destinationStopCode: "milano-centrale",
		destinationStopName: "Milano Centrale",
		durationMinutes: 60,
		transferCount: 1,
		walkingMinutes: 7,
		walkingMeters: 420,
		sourceUrl: "https://www.milanbergamoairport.it/en/bus/",
		checkedAt: "2026-08-01T00:00:00.000Z",
		costMinorMin: 1_000,
		costMinorMax: 1_200,
		purchaseUrl: "https://www.terravision.eu/airport_transfer/",
		publicationStatus: "published",
		provenance: "operator_verified",
		freshness: "fresh",
		createdAt: "2026-08-01T00:00:00.000Z",
		updatedAt: "2026-08-01T00:00:00.000Z",
		...overrides,
	};
}

function route(stopName = "Milano Centrale"): TransitRoute {
	return {
		id: "route-1",
		departureTime: "2026-08-13T09:05:00.000Z",
		arrivalTime: "2026-08-13T10:00:00.000Z",
		durationMinutes: 55,
		transfers: 0,
		walkingMinutes: 3,
		walkingMeters: 180,
		legs: [
			{
				mode: "bus",
				from: "BGY Terminal",
				to: stopName,
				durationMinutes: 55,
				walkingMeters: 0,
			},
		],
		fare: { currency: "EUR", amountMinor: null, completeness: "unknown" },
		source: { kind: "fixture", label: "synthetic_recorded_for_testing" },
	};
}

function transit(result: ProviderResult<TransitRoute[], TransitRoute>): TransitProvider {
	return { route: async () => result };
}

function catalog(entries: PublishedTransferCatalogEntry[]): TransferCatalogRepository {
	return { listPublished: async () => entries };
}

async function outcomes(entries: PublishedTransferCatalogEntry[], stopName?: string) {
	const success = await recommendJourneys(request, {
		transit: transit({ status: "success", value: [route(stopName)] }),
		catalog: catalog(entries),
	});
	const failure = await recommendJourneys(request, {
		transit: transit({ status: "timeout", retryable: true }),
		catalog: catalog(entries),
	});
	return { success, failure };
}

type Outcomes = Awaited<ReturnType<typeof outcomes>>;

function alternatives(result: JourneyRecommendationResult) {
	return result.status === "recommendations" ? [] : result.catalogAlternatives;
}

function firstAlternative(result: JourneyRecommendationResult) {
	const [alternative] = alternatives(result);
	if (!alternative) throw new Error("Brak alternatywy katalogowej");
	return alternative;
}

function successVariant(result: JourneyRecommendationResult) {
	if (result.status !== "recommendations") throw new Error("Brak rekomendacji");
	const [variant] = result.variants;
	if (!variant) throw new Error("Brak wariantu");
	return variant;
}

/** Every publication-required field, its mutation, and the consumer it must move. */
const FIELD_CONSUMERS: Record<
	TransferCatalogEditableField,
	{ mutate: Partial<PublishedTransferCatalogEntry>; read(outcome: Outcomes): unknown }
> = {
	operatorName: {
		mutate: { operatorName: "Autostradale" },
		read: ({ success }) =>
			successVariant(success).sourceReferences.map((reference) => reference.label),
	},
	serviceName: {
		mutate: { serviceName: "BGY → Milano Lambrate" },
		read: ({ success }) =>
			successVariant(success).sourceReferences.map((reference) => reference.label),
	},
	destinationStopCode: {
		mutate: { destinationStopCode: "milano-lambrate" },
		read: ({ failure }) => firstAlternative(failure).destinationStopCode,
	},
	destinationStopName: {
		mutate: { destinationStopName: "Milano Lambrate" },
		read: ({ failure }) => firstAlternative(failure).destinationStopName,
	},
	durationMinutes: {
		mutate: { durationMinutes: 75 },
		read: ({ failure }) => firstAlternative(failure).durationMinutes,
	},
	transferCount: {
		mutate: { transferCount: 3 },
		read: ({ failure }) => firstAlternative(failure).transferCount,
	},
	walkingMinutes: {
		mutate: { walkingMinutes: 14 },
		read: ({ failure }) => firstAlternative(failure).walkingMinutes,
	},
	walkingMeters: {
		mutate: { walkingMeters: 900 },
		read: ({ failure }) => firstAlternative(failure).walkingMeters,
	},
	sourceUrl: {
		mutate: { sourceUrl: "https://www.terravision.eu/airport_transfer/" },
		read: ({ success }) => successVariant(success).sourceReferences.map((source) => source.url),
	},
	checkedAt: {
		mutate: { checkedAt: "2026-06-01T00:00:00.000Z", freshness: "stale" },
		read: ({ success, failure }) => [
			successVariant(success).manualVerification,
			firstAlternative(failure).freshness,
		],
	},
	costMinorMin: {
		mutate: { costMinorMin: 500 },
		read: ({ success, failure }) => [successVariant(success).cost, firstAlternative(failure).cost],
	},
	costMinorMax: {
		mutate: { costMinorMax: 2_000 },
		read: ({ success, failure }) => [successVariant(success).cost, firstAlternative(failure).cost],
	},
	purchaseUrl: {
		mutate: { purchaseUrl: "https://www.airportbusexpress.it/tickets" },
		read: ({ success, failure }) => [
			successVariant(success).externalLinks.map((link) => link.url),
			firstAlternative(failure).purchaseLink?.url,
		],
	},
};

describe("every publication-required catalog value reaches a consumer", () => {
	it.each(
		Object.entries(FIELD_CONSUMERS),
	)("%s changes its documented consumer", async (_name, consumer) => {
		const baseline = await outcomes([entry()]);
		const mutated = await outcomes([entry(consumer.mutate)]);
		expect(consumer.read(mutated)).not.toEqual(consumer.read(baseline));
	});

	it("covers all 13 editable fields", () => {
		expect(Object.keys(FIELD_CONSUMERS)).toHaveLength(13);
	});
});

describe("stable stop identity and service name drive catalog merge", () => {
	it.each([
		["Milano Centrale", "identyczna nazwa"],
		["milano centrale", "inna wielkość liter"],
		["  Milano   Centrale  ", "nadmiarowe spacje"],
		["Milano-Centrale", "inny separator"],
	])("merges a catalog entry when the provider stop reads %s (%s)", async (stopName) => {
		const { success } = await outcomes([entry()], stopName);
		expect(successVariant(success).sourceReferences).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "catalog", label: "Terravision · BGY → Milano Centrale" }),
			]),
		);
	});

	it("merges on the stable stop code even when the display name differs", async () => {
		const { success } = await outcomes(
			[entry({ destinationStopName: "Mediolan Centralny" })],
			"Milano Centrale",
		);
		expect(successVariant(success).sourceReferences).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "catalog" })]),
		);
	});

	it("does not merge an entry for a different stop", async () => {
		const { success } = await outcomes(
			[entry({ destinationStopCode: "milano-lambrate", destinationStopName: "Milano Lambrate" })],
			"Milano Centrale",
		);
		expect(successVariant(success).sourceReferences).toEqual([
			expect.objectContaining({ kind: "provider" }),
		]);
	});
});

describe("catalog alternatives on provider failure", () => {
	it("renders the manually verified transfer with every operator-entered fact", async () => {
		const { failure } = await outcomes([entry()]);
		expect(failure.status).toBe("recommendation_unavailable");
		expect(firstAlternative(failure)).toEqual({
			id: "catalog-1",
			kind: "manually_verified_transfer",
			operatorName: "Terravision",
			serviceName: "BGY → Milano Centrale",
			destinationStopCode: "milano-centrale",
			destinationStopName: "Milano Centrale",
			durationMinutes: 60,
			transferCount: 1,
			walkingMinutes: 7,
			walkingMeters: 420,
			cost: { currency: "EUR", minorMin: 1_000, minorMax: 1_200, completeness: "partial" },
			source: {
				kind: "catalog",
				label: "Terravision · BGY → Milano Centrale",
				url: "https://www.milanbergamoairport.it/en/bus/",
				checkedAt: "2026-08-01T00:00:00.000Z",
			},
			freshness: "fresh",
			purchaseLink: {
				kind: "purchase",
				label: "Sprawdź u Terravision",
				url: "https://www.terravision.eu/airport_transfer/",
			},
		});
	});

	it("never invents an arrival time, badge, or step for a catalog alternative", async () => {
		const { failure } = await outcomes([entry()]);
		const alternative = firstAlternative(failure) as Record<string, unknown>;
		expect(alternative.arrivalTimeUtc).toBeUndefined();
		expect(alternative.badges).toBeUndefined();
		expect(alternative.steps).toBeUndefined();
		expect(JSON.stringify(failure)).not.toMatch(/recommended|fastest|simplest/);
	});

	it("offers catalog alternatives when the provider returns no trustworthy route", async () => {
		const noRoute = await recommendJourneys(request, {
			transit: transit({ status: "zero_result" }),
			catalog: catalog([entry()]),
		});
		expect(noRoute.status).toBe("no_trustworthy_route");
		expect(alternatives(noRoute)).toHaveLength(1);
	});
});

describe("provider metrics stay authoritative on success", () => {
	it("never lets manual transfer facts overwrite the provider itinerary", async () => {
		const { success } = await outcomes([entry()]);
		const variant = successVariant(success);
		expect(variant.durationMinutes).toBe(55);
		expect(variant.transferCount).toBe(0);
		expect(variant.walkingMinutes).toBe(3);
		expect(variant.walkingMeters).toBe(180);
		expect(variant.arrivalTimeUtc).toBe("2026-08-13T10:00:00.000Z");
		expect(variant.badges).toContain("recommended");
	});

	it("keeps catalog alternatives out of a successful recommendation payload", async () => {
		const { success } = await outcomes([entry()]);
		expect(JSON.stringify(success)).not.toContain("manually_verified_transfer");
	});
});
