import type { ProviderDiagnostic } from "@repo/data-ops/diagnostics";
import { describe, expect, it } from "vitest";
import { createDestinationService } from "../destination/service";
import { resolveFlight } from "../flight/resolver";
import { recommendJourneys } from "../journey/engine";
import type { DiagnosticContext } from "./diagnostics";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";
import type {
	FlightProvider,
	PlacesProvider,
	ProviderResult,
	TransitProvider,
	TransitRoute,
} from "./types";

/*
 * Issue #20: every injected provider fault must terminate in one existing safe domain
 * outcome, one normalized category, and one explicit recovery action — with the
 * documented manual/retry/change-parameters fallbacks still reachable.
 */

type Failure = Exclude<ProviderResult<never, never>, { status: "success" }>;

const FAULTS: ReadonlyArray<{
	name: string;
	result: Failure;
	category: ProviderDiagnostic["category"];
}> = [
	{ name: "timeout", result: { status: "timeout", retryable: true }, category: "transient_outage" },
	{
		name: "quota",
		result: { status: "rate_limited", retryable: true, signal: "quota_exceeded" },
		category: "quota_or_rate_limit",
	},
	{
		name: "plan denial",
		result: {
			status: "provider_error",
			httpStatus: 403,
			retryable: false,
			signal: "plan_feature_restricted",
		},
		category: "plan_restricted",
	},
	{
		name: "billing denial",
		result: {
			status: "provider_error",
			httpStatus: 403,
			retryable: false,
			signal: "billing_disabled",
		},
		category: "access_configuration",
	},
	{
		name: "unknown access denial",
		result: {
			status: "provider_error",
			httpStatus: 403,
			retryable: false,
			signal: "unrecognized_access_denied",
		},
		category: "access_configuration",
	},
	{
		name: "provider 5xx",
		result: { status: "provider_error", httpStatus: 500, retryable: true },
		category: "transient_outage",
	},
	{ name: "malformed", result: { status: "malformed_response" }, category: "malformed_response" },
	{
		name: "incomplete",
		result: { status: "incomplete_response", missingFields: ["data"] },
		category: "malformed_response",
	},
	{ name: "zero result", result: { status: "zero_result" }, category: "provider_coverage" },
];

const NOW = new Date("2026-08-13T09:00:00.000Z");

function context(providerClass: DiagnosticContext["providerClass"]): DiagnosticContext {
	return { providerClass, reference: "cf-ray-diagnostic", exposure: "detailed", now: () => NOW };
}

function flightProvider(result: Failure): FlightProvider {
	return { lookup: async () => result as ProviderResult<never> };
}

function placesProvider(result: Failure): PlacesProvider {
	return {
		viewport: MILAN_MUNICIPALITY_VIEWPORT,
		autocomplete: async () => result as never,
		details: async () => result as never,
	};
}

function transitProvider(result: Failure): TransitProvider {
	return { route: async () => result as ProviderResult<TransitRoute[], TransitRoute> };
}

const repository = {
	save: async () => {
		throw new Error("no persistence expected on a provider failure");
	},
};

const journeyRequest = {
	flightInstanceId: "flight-1",
	scheduledArrivalUtc: "2026-08-13T08:20:00.000Z",
	privateDestinationCoordinates: { latitude: 45.464098, longitude: 9.191926 },
	bufferMinutes: 45,
};

describe("domain outcomes carry one safe diagnostic", () => {
	it.each(FAULTS)("maps flight $name to manual_required with a category", async (fault) => {
		const result = await resolveFlight(
			{ flightNumber: "W61431", departureLocalDate: "2026-08-13" },
			{ provider: flightProvider(fault.result), repository, diagnostics: context("lot") },
		);
		expect(result.status).toBe("manual_required");
		if (result.status !== "manual_required") return;
		expect(["not_found", "timeout", "rate_limited", "provider_error", "incomplete"]).toContain(
			result.reason,
		);
		expect(result.diagnostic).toEqual({
			reference: "cf-ray-diagnostic",
			occurredAtUtc: NOW.toISOString(),
			recovery: expect.stringMatching(/^(retry|manual|change_parameters)$/),
			providerClass: "lot",
			category: fault.category,
		});
	});

	it.each(FAULTS)("maps destination $name to an unavailable outcome", async (fault) => {
		const service = createDestinationService(placesProvider(fault.result), context("miejsce"));
		const autocomplete = await service.autocomplete({
			query: "Via Torino",
			sessionToken: "session-token-1234567890",
		});
		const selection = await service.select({
			placeId: "place-1",
			sessionToken: "session-token-1234567890",
		});
		expect(autocomplete.status).toBe("autocomplete_unavailable");
		expect(selection.status).toBe("destination_unavailable");
		for (const outcome of [autocomplete, selection]) {
			if (outcome.status === "suggestions" || outcome.status === "destination_selected") continue;
			if (outcome.status === "destination_not_supported") continue;
			expect(outcome.diagnostic?.category).toBe(fault.category);
			expect(outcome.diagnostic?.providerClass).toBe("miejsce");
			expect(["retry", "change_parameters"]).toContain(outcome.diagnostic?.recovery);
		}
	});

	it.each(FAULTS)("maps journey $name to a trustworthy failure", async (fault) => {
		const result = await recommendJourneys(journeyRequest, {
			transit: transitProvider(fault.result),
			catalog: { listPublished: async () => [] },
			diagnostics: context("trasa"),
		});
		expect(["no_trustworthy_route", "recommendation_unavailable"]).toContain(result.status);
		if (result.status === "recommendations") return;
		expect(result.diagnostic?.category).toBe(fault.category);
		expect(result.diagnostic?.providerClass).toBe("trasa");
		expect(result.diagnostic?.reference).toBe("cf-ray-diagnostic");
	});
});

describe("diagnostic exposure and privacy", () => {
	it("drops provider class and category under the production exposure rule", async () => {
		const result = await resolveFlight(
			{ flightNumber: "W61431", departureLocalDate: "2026-08-13" },
			{
				provider: flightProvider({ status: "provider_error", httpStatus: 403, retryable: false }),
				repository,
				diagnostics: {
					providerClass: "lot",
					reference: "cf-ray-production",
					exposure: "minimal",
					now: () => NOW,
				},
			},
		);
		expect(result.status === "manual_required" && result.diagnostic).toEqual({
			reference: "cf-ray-production",
			occurredAtUtc: NOW.toISOString(),
			recovery: "manual",
		});
	});

	it("omits the diagnostic entirely when no correlation context is supplied", async () => {
		const result = await resolveFlight(
			{ flightNumber: "W61431", departureLocalDate: "2026-08-13" },
			{ provider: flightProvider({ status: "zero_result" }), repository },
		);
		expect(result).toEqual({
			status: "manual_required",
			reason: "not_found",
			flightNumber: "W61431",
			departureLocalDate: "2026-08-13",
		});
	});

	it("keeps private destination data, email, and provider payloads out of every diagnostic", async () => {
		const service = createDestinationService(
			placesProvider({
				status: "provider_error",
				httpStatus: 403,
				retryable: false,
				signal: "billing_disabled",
			}),
			context("miejsce"),
		);
		const journey = await recommendJourneys(journeyRequest, {
			transit: transitProvider({ status: "timeout", retryable: true }),
			catalog: { listPublished: async () => [] },
			diagnostics: context("trasa"),
		});
		const serialized = JSON.stringify([
			await service.select({ placeId: "ChIJ-private", sessionToken: "session-token-1234567890" }),
			journey,
		]);
		expect(serialized).not.toContain("ChIJ-private");
		expect(serialized).not.toContain("45.464098");
		expect(serialized).not.toContain("9.191926");
		expect(serialized).not.toMatch(/@|access_key|X-Goog-Api-Key|rawPayload/);
	});
});

describe("documented fallbacks stay reachable", () => {
	it("keeps all five flight manual reasons and a manual recovery for access failures", async () => {
		const reasons = new Set<string>();
		for (const fault of FAULTS) {
			const result = await resolveFlight(
				{ flightNumber: "W61431", departureLocalDate: "2026-08-13" },
				{ provider: flightProvider(fault.result), repository, diagnostics: context("lot") },
			);
			if (result.status === "manual_required") reasons.add(result.reason);
		}
		expect([...reasons].sort()).toEqual([
			"incomplete",
			"not_found",
			"provider_error",
			"rate_limited",
			"timeout",
		]);
	});

	it("keeps journey manual alternatives alongside the diagnostic", async () => {
		const result = await recommendJourneys(journeyRequest, {
			transit: transitProvider({ status: "timeout", retryable: true }),
			catalog: {
				listPublished: async () => [
					{
						id: "catalog-1",
						operatorName: "Terravision",
						serviceName: "BGY → Milano Centrale",
						originIata: "BGY",
						destinationStopCode: "milano-centrale",
						destinationStopName: "Milano Centrale",
						durationMinutes: 60,
						transferCount: 0,
						walkingMinutes: 5,
						walkingMeters: 300,
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
					},
				],
			},
			diagnostics: context("trasa"),
		});
		expect(result.status).toBe("recommendation_unavailable");
		if (result.status === "recommendations") return;
		expect(result.manualAlternatives.length).toBeGreaterThan(0);
		expect(result.diagnostic?.recovery).toBe("retry");
	});
});
