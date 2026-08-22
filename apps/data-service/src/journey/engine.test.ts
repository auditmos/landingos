import {
	DEFAULT_TRANSFER_CATALOG_SEED,
	type JourneyRecommendationRequest,
	type TransferCatalogEntry,
} from "@repo/data-ops/journey";
import {
	BGY_ROUTE_ORIGIN,
	BGY_ROUTE_ORIGIN_PROVENANCE,
	type ProviderResult,
	type TransitProvider,
	type TransitRoute,
} from "../providers";
import { recommendJourneys, type TransferCatalogRepository } from "./engine";

const request: JourneyRecommendationRequest = {
	flightInstanceId: "flight-id",
	scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
	privateDestinationCoordinates: { latitude: 45.464098, longitude: 9.191926 },
	bufferMinutes: 45,
};

function route(
	id: string,
	options: {
		duration?: number;
		transfers?: number;
		walkingMinutes?: number;
		walkingMeters?: number;
		fare?: TransitRoute["fare"];
		departureTime?: string;
		viaCentrale?: boolean;
	} = {},
): TransitRoute {
	const duration = options.duration ?? 65;
	const walkingMinutes = options.walkingMinutes ?? 8;
	const walkingMeters = options.walkingMeters ?? walkingMinutes * 75;
	const departureTime = options.departureTime ?? "2026-09-14T09:05:00.000Z";
	return {
		id,
		departureTime,
		arrivalTime: new Date(new Date(departureTime).getTime() + duration * 60_000).toISOString(),
		durationMinutes: duration,
		transfers: options.transfers ?? 0,
		walkingMinutes,
		walkingMeters,
		legs: [
			{
				mode: "bus",
				from: "Aeroporto BGY",
				to: options.viaCentrale === false ? "Porta Garibaldi" : "Milano Centrale",
				durationMinutes: duration - walkingMinutes,
				walkingMeters: 0,
			},
			{
				mode: "walk",
				from: options.viaCentrale === false ? "Porta Garibaldi" : "Milano Centrale",
				to: `Cel ${id}`,
				durationMinutes: walkingMinutes,
				walkingMeters,
			},
		],
		fare: options.fare ?? {
			currency: "EUR",
			amountMinor: 1_500,
			completeness: "complete",
		},
		source: { kind: "fixture", label: "synthetic_recorded_for_testing" },
	};
}

function transit(result: ProviderResult<TransitRoute[], TransitRoute>): TransitProvider {
	return { route: vi.fn(async () => result) };
}

function catalog(entries: TransferCatalogEntry[] = []): TransferCatalogRepository {
	return { listPublished: vi.fn(async () => entries) };
}

function seededCatalog(overrides: Partial<TransferCatalogEntry> = {}): TransferCatalogEntry {
	return {
		...(DEFAULT_TRANSFER_CATALOG_SEED[0] as NonNullable<(typeof DEFAULT_TRANSFER_CATALOG_SEED)[0]>),
		createdAt: "2026-07-27T00:00:00.000Z",
		updatedAt: "2026-07-27T00:00:00.000Z",
		...overrides,
	};
}

function permutations<T>(values: T[]): T[][] {
	if (values.length <= 1) return [values];
	return values.flatMap((value, index) =>
		permutations(values.filter((_, candidateIndex) => candidateIndex !== index)).map(
			(remainder) => [value, ...remainder],
		),
	);
}

describe("journey recommendation engine", () => {
	it.each([
		[15, "2026-09-14T08:35:00.000Z"],
		[45, "2026-09-14T09:05:00.000Z"],
		[180, "2026-09-14T11:20:00.000Z"],
	])("recomputes buffer %i exactly once at %s", async (bufferMinutes, expectedDepartureTime) => {
		const provider = transit({ status: "success", value: [route(`buffer-${bufferMinutes}`)] });
		await recommendJourneys(
			{ ...request, bufferMinutes },
			{ transit: provider, catalog: catalog() },
		);
		expect(provider.route).toHaveBeenCalledTimes(1);
		expect(provider.route).toHaveBeenCalledWith({
			origin: { latitude: 45.6656872, longitude: 9.6978308 },
			destination: request.privateDestinationCoordinates,
			departureTime: expectedDepartureTime,
		});
	});

	it("routes from the BGY arrivals bus station, not the aerodrome reference point", () => {
		expect(BGY_ROUTE_ORIGIN).toEqual({ latitude: 45.6656872, longitude: 9.6978308 });
		expect(BGY_ROUTE_ORIGIN_PROVENANCE).toMatchObject({
			placeName: "Bergamo Airport Bus Station",
			placeType: "bus_station",
			source: "google_places_text_search",
			checkedOn: "2026-08-22",
		});
	});

	it("ranks with locked tie-breakers identically for every input ordering", async () => {
		const candidates = [
			route("unknown-fast", {
				duration: 40,
				transfers: 2,
				walkingMinutes: 10,
				fare: { currency: "EUR", amountMinor: null, completeness: "unknown" },
				viaCentrale: false,
			}),
			route("complete-simple", {
				duration: 50,
				transfers: 0,
				walkingMinutes: 5,
				viaCentrale: false,
			}),
			route("partial-fastest", {
				duration: 35,
				transfers: 1,
				walkingMinutes: 8,
				fare: { currency: "EUR", amountMinor: 900, completeness: "partial" },
				viaCentrale: false,
			}),
			route("complete-filler", {
				duration: 60,
				transfers: 1,
				walkingMinutes: 2,
				viaCentrale: false,
			}),
		];
		const outputs = [];
		for (const ordered of permutations(candidates)) {
			outputs.push(
				await recommendJourneys(request, {
					transit: transit({ status: "success", value: ordered as TransitRoute[] }),
					catalog: catalog(),
				}),
			);
		}
		expect(outputs).toHaveLength(24);
		for (const output of outputs) expect(output).toEqual(outputs[0]);
		expect(outputs[0]).toMatchObject({
			status: "recommendations",
			variants: [{ badges: ["recommended", "simplest"] }, { badges: ["fastest"] }, { badges: [] }],
		});
		const first = outputs[0];
		expect(first?.status).toBe("recommendations");
		if (first?.status === "recommendations") {
			expect(first.variants).toHaveLength(3);
			expect(new Set(first.variants.map((variant) => JSON.stringify(variant.steps))).size).toBe(3);
		}
	});

	it("deduplicates equivalent itineraries and renders one card with all winning badges", async () => {
		const first = route("provider-a");
		const duplicate = {
			...first,
			id: "provider-b",
			source: { kind: "live" as const, label: "live" },
		};
		const result = await recommendJourneys(request, {
			transit: transit({ status: "success", value: [duplicate, first] }),
			catalog: catalog(),
		});
		expect(result).toMatchObject({
			status: "recommendations",
			explanation: expect.stringContaining("jedną"),
			variants: [{ badges: ["recommended", "fastest", "simplest"] }],
		});
	});

	it("merges a fresh seeded catalog entry into a matching route without fabricating a fare", async () => {
		const result = await recommendJourneys(request, {
			transit: transit({
				status: "success",
				value: [
					route("unknown-via-centrale", {
						fare: { currency: "EUR", amountMinor: null, completeness: "unknown" },
					}),
				],
			}),
			catalog: catalog([seededCatalog()]),
			now: () => new Date("2026-08-01T00:00:00.000Z"),
		});
		expect(result).toMatchObject({
			status: "recommendations",
			variants: [
				{
					cost: {
						minorMin: 1_000,
						minorMax: 1_200,
						completeness: "partial",
					},
					manualVerification: {
						checkedAt: "2026-07-27T00:00:00.000Z",
						freshness: "fresh",
					},
					sourceReferences: expect.arrayContaining([expect.objectContaining({ kind: "catalog" })]),
					externalLinks: expect.arrayContaining([expect.objectContaining({ kind: "purchase" })]),
				},
			],
		});
	});

	it("never forwards a provider-controlled destination string into source references", async () => {
		const privateMarker = "Via Segreta 42 | 45.464098,9.191926";
		const providerRoute = route("private-source-marker");
		providerRoute.source.label = privateMarker;
		const result = await recommendJourneys(request, {
			transit: transit({ status: "success", value: [providerRoute] }),
			catalog: catalog(),
		});
		expect(JSON.stringify(result)).not.toContain(privateMarker);
		expect(result).toMatchObject({
			status: "recommendations",
			variants: [
				{
					sourceReferences: [
						{
							kind: "provider",
							label: "Dane testowe LandingOS",
						},
					],
				},
			],
		});
	});

	it("uses the configurable 30-day default to mark stale manual data distinctly", async () => {
		const result = await recommendJourneys(request, {
			transit: transit({
				status: "success",
				value: [
					route("stale", {
						fare: { currency: "EUR", amountMinor: null, completeness: "unknown" },
					}),
				],
			}),
			catalog: catalog([seededCatalog()]),
			now: () => new Date("2026-08-27T00:00:00.001Z"),
		});
		expect(result).toMatchObject({
			status: "recommendations",
			variants: [{ manualVerification: { freshness: "stale" } }],
		});
	});

	it("uses a catalog edit on the very next recommendation without a cache flush", async () => {
		const entries = [seededCatalog()];
		const repository: TransferCatalogRepository = {
			listPublished: vi.fn(async () => entries),
		};
		const provider = transit({
			status: "success",
			value: [
				route("catalog-refresh", {
					fare: { currency: "EUR", amountMinor: null, completeness: "unknown" },
				}),
			],
		});
		const first = await recommendJourneys(request, {
			transit: provider,
			catalog: repository,
			now: () => new Date("2026-07-27T12:00:00.000Z"),
		});
		entries[0] = seededCatalog({ costMinorMin: 2_000, costMinorMax: 2_200 });
		const second = await recommendJourneys(request, {
			transit: provider,
			catalog: repository,
			now: () => new Date("2026-07-27T12:00:00.000Z"),
		});
		expect(first).toMatchObject({
			status: "recommendations",
			variants: [{ cost: { minorMin: 1_000, minorMax: 1_200 } }],
		});
		expect(second).toMatchObject({
			status: "recommendations",
			variants: [{ cost: { minorMin: 2_000, minorMax: 2_200 } }],
		});
		expect(repository.listPublished).toHaveBeenCalledTimes(2);
	});

	it.each([
		[{ status: "zero_result" }, "no_trustworthy_route", "zero_result"],
		[{ status: "timeout", retryable: true }, "recommendation_unavailable", "timeout"],
		[{ status: "rate_limited", retryable: true }, "recommendation_unavailable", "rate_limited"],
		[
			{ status: "provider_error", httpStatus: 500, retryable: true },
			"recommendation_unavailable",
			"provider_error",
		],
		[
			{ status: "incomplete_response", missingFields: ["routes"] as string[] },
			"recommendation_unavailable",
			"incomplete",
		],
		[{ status: "malformed_response" }, "recommendation_unavailable", "incomplete"],
	] as const)("maps provider fault to %s/%s", async (providerResult, status, reason) => {
		await expect(
			recommendJourneys(request, {
				transit: transit(providerResult),
				catalog: catalog([seededCatalog()]),
			}),
		).resolves.toMatchObject({ status, reason });
	});

	it("rejects routes that start before the buffered post-arrival departure", async () => {
		const result = await recommendJourneys(request, {
			transit: transit({
				status: "success",
				value: [route("too-early", { departureTime: "2026-09-14T09:04:59.999Z" })],
			}),
			catalog: catalog(),
		});
		expect(result).toEqual({
			status: "no_trustworthy_route",
			reason: "no_post_arrival_route",
			manualAlternatives: [],
			catalogAlternatives: [],
		});
	});

	it("is byte-identical for zero, one, and many room members and never queries rooms", async () => {
		const roomQuery = vi.fn();
		const outputs = [];
		for (const members of [[], ["Solo"], ["A", "B", "C"]]) {
			outputs.push(
				await recommendJourneys(request, {
					transit: transit({ status: "success", value: [route("same")] }),
					catalog: catalog(),
					room: { members, query: roomQuery },
				} as unknown as Parameters<typeof recommendJourneys>[1]),
			);
		}
		expect(JSON.stringify(outputs[1])).toBe(JSON.stringify(outputs[0]));
		expect(JSON.stringify(outputs[2])).toBe(JSON.stringify(outputs[0]));
		expect(roomQuery).not.toHaveBeenCalled();
	});
});
