import { describe, expect, it } from "vitest";
import {
	buildProviderDiagnostic,
	classifyProviderOutcome,
	diagnosticExposure,
	type ProviderClass,
} from "./diagnostics";
import { createLiveFlightProvider } from "./live-flight";
import type { ProviderFetch } from "./live-http";
import { createLivePlacesProvider } from "./live-places";
import { createLiveTransitProvider } from "./live-transit";
import type { ProviderResult } from "./types";

/*
 * Issue #20 assumptions approved before RED:
 * - input: only documented, allowlisted provider status/error codes may be classified;
 * - output: every failure keeps its existing domain outcome and gains one normalized category;
 * - boundary: an unrecognized 401/403 is a generic access/configuration failure, never a
 *   free-plan, billing, or quota attribution;
 * - excluded here: live provider suitability and commercial/licensing acceptance (#16).
 */

const FAULT_CASES = [
	"timeout",
	"quota_429",
	"plan_feature_denied",
	"billing_permission_denied",
	"unknown_access_denied",
	"provider_5xx",
	"malformed_payload",
	"incomplete_payload",
	"zero_result",
	"ambiguous_result",
] as const;

type FaultCase = (typeof FAULT_CASES)[number];

type Expectation = {
	respond: ProviderFetch;
	status: ProviderResult<unknown, unknown>["status"];
	category: ReturnType<typeof classifyProviderOutcome>;
};

function json(body: unknown, status: number): ProviderFetch {
	return async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});
}

function raw(body: string, status: number): ProviderFetch {
	return async () =>
		new Response(body, { status, headers: { "content-type": "application/json" } });
}

// The adapters own their abort deadline; raising the same AbortError the deadline
// raises keeps the table fast without weakening the assertion.
const abortsLikeATimeout: ProviderFetch = async () => {
	throw new DOMException("aborted", "AbortError");
};

// Documented Google Maps Platform error envelope. Google has no plan tiers, so a
// documented denial is an access/configuration failure — never a "free plan" claim.
function googleError(status: number, googleStatus: string, reason?: string) {
	return {
		error: {
			code: status,
			status: googleStatus,
			message: "provider message that must never reach a response",
			...(reason ? { details: [{ reason }] } : {}),
		},
	};
}

const aviationstackFlight = {
	flight: { iata: "W61431" },
	airline: { name: "Wizz Air" },
	departure: { iata: "WAW", airport: "Warsaw Chopin" },
	arrival: {
		iata: "BGY",
		airport: "Milan Bergamo",
		scheduled: "2026-08-10T10:30:00+00:00",
		timezone: "Europe/Rome",
	},
};

const googleSuggestion = (placeId: string) => ({
	placePrediction: {
		placeId,
		structuredFormat: {
			mainText: { text: "Via Torino 21" },
			secondaryText: { text: "Milano" },
		},
	},
});

const googleRoute = {
	duration: "3600s",
	legs: [
		{
			steps: [
				{
					travelMode: "TRANSIT",
					staticDuration: "3600s",
					transitDetails: {
						stopDetails: {
							departureStop: { name: "BGY Terminal" },
							arrivalStop: { name: "Milano Centrale" },
						},
						transitLine: { vehicle: { type: "BUS" } },
					},
				},
			],
		},
	],
};

function flightCases(): Record<FaultCase, Expectation> {
	return {
		timeout: { respond: abortsLikeATimeout, status: "timeout", category: "transient_outage" },
		quota_429: {
			respond: json({ error: { code: "usage_limit_reached", message: "monthly limit" } }, 429),
			status: "rate_limited",
			category: "quota_or_rate_limit",
		},
		plan_feature_denied: {
			respond: json(
				{ error: { code: "function_access_restricted", message: "not on your plan" } },
				403,
			),
			status: "provider_error",
			category: "plan_restricted",
		},
		billing_permission_denied: {
			respond: json({ error: { code: "inactive_user", message: "account inactive" } }, 401),
			status: "provider_error",
			category: "access_configuration",
		},
		unknown_access_denied: {
			respond: raw('{"message":"Forbidden"}', 403),
			status: "provider_error",
			category: "access_configuration",
		},
		provider_5xx: { respond: raw("", 500), status: "provider_error", category: "transient_outage" },
		malformed_payload: {
			respond: raw("{", 200),
			status: "malformed_response",
			category: "malformed_response",
		},
		incomplete_payload: {
			respond: json({ data: [{}] }, 200),
			status: "incomplete_response",
			category: "malformed_response",
		},
		zero_result: {
			respond: json({ data: [] }, 200),
			status: "zero_result",
			category: "provider_coverage",
		},
		ambiguous_result: {
			respond: json(
				{
					data: [
						aviationstackFlight,
						{ ...aviationstackFlight, airline: { name: "Wizz Air Malta" } },
					],
				},
				200,
			),
			status: "ambiguous",
			category: "provider_coverage",
		},
	};
}

function googleCases(payloads: {
	malformed: string;
	incomplete: unknown;
	zero: unknown;
	ambiguous: unknown;
	ambiguousStatus: ProviderResult<unknown, unknown>["status"];
	ambiguousCategory: ReturnType<typeof classifyProviderOutcome>;
}): Record<FaultCase, Expectation> {
	return {
		timeout: { respond: abortsLikeATimeout, status: "timeout", category: "transient_outage" },
		quota_429: {
			respond: json(googleError(429, "RESOURCE_EXHAUSTED"), 429),
			status: "rate_limited",
			category: "quota_or_rate_limit",
		},
		plan_feature_denied: {
			respond: json(googleError(403, "PERMISSION_DENIED", "SERVICE_DISABLED"), 403),
			status: "provider_error",
			category: "access_configuration",
		},
		billing_permission_denied: {
			respond: json(googleError(403, "PERMISSION_DENIED", "BILLING_DISABLED"), 403),
			status: "provider_error",
			category: "access_configuration",
		},
		unknown_access_denied: {
			respond: raw("", 401),
			status: "provider_error",
			category: "access_configuration",
		},
		provider_5xx: { respond: raw("", 503), status: "provider_error", category: "transient_outage" },
		malformed_payload: {
			respond: raw(payloads.malformed, 200),
			status: "malformed_response",
			category: "malformed_response",
		},
		incomplete_payload: {
			respond: json(payloads.incomplete, 200),
			status: "incomplete_response",
			category: "malformed_response",
		},
		zero_result: {
			respond: json(payloads.zero, 200),
			status: "zero_result",
			category: "provider_coverage",
		},
		ambiguous_result: {
			respond: json(payloads.ambiguous, 200),
			status: payloads.ambiguousStatus,
			category: payloads.ambiguousCategory,
		},
	};
}

interface ProviderUnderTest {
	name: string;
	providerClass: ProviderClass;
	cases: Record<FaultCase, Expectation>;
	call(fetchImpl: ProviderFetch): Promise<ProviderResult<unknown, unknown>>;
}

const providers: ProviderUnderTest[] = [
	{
		name: "flight",
		providerClass: "lot",
		cases: flightCases(),
		call: (fetchImpl) =>
			createLiveFlightProvider({ aviationstackAccessKey: "test-key" }, fetchImpl, {
				today: () => "2026-08-10",
			}).lookup({ flightNumber: "W61431", date: "2026-08-10" }) as Promise<
				ProviderResult<unknown, unknown>
			>,
	},
	{
		name: "places",
		providerClass: "miejsce",
		cases: googleCases({
			malformed: "{",
			incomplete: { suggestions: [{ placePrediction: {} }] },
			zero: { suggestions: [] },
			ambiguous: { suggestions: [googleSuggestion("place-1"), googleSuggestion("place-2")] },
			ambiguousStatus: "ambiguous",
			ambiguousCategory: "provider_coverage",
		}),
		call: (fetchImpl) =>
			createLivePlacesProvider({ googleMapsApiKey: "test-key" }, fetchImpl).autocomplete({
				query: "Via Torino",
			}) as Promise<ProviderResult<unknown, unknown>>,
	},
	{
		name: "transit",
		providerClass: "trasa",
		cases: googleCases({
			malformed: "{",
			incomplete: { routes: [{}] },
			zero: { routes: [] },
			// Several alternatives are a documented valid routing result, not a fault.
			ambiguous: { routes: [googleRoute, googleRoute] },
			ambiguousStatus: "success",
			ambiguousCategory: null,
		}),
		call: (fetchImpl) =>
			createLiveTransitProvider({ googleMapsApiKey: "test-key" }, fetchImpl).route({
				origin: { latitude: 45.6739, longitude: 9.7042 },
				destination: { latitude: 45.4642, longitude: 9.19 },
				departureTime: "2026-08-10T11:15:00.000Z",
			}) as Promise<ProviderResult<unknown, unknown>>,
	},
];

describe("provider diagnostic taxonomy", () => {
	for (const provider of providers) {
		describe(provider.name, () => {
			it.each(FAULT_CASES)("normalizes %s into one safe outcome and category", async (name) => {
				const expectation = provider.cases[name];
				const result = await provider.call(expectation.respond);
				expect(result.status).toBe(expectation.status);
				expect(classifyProviderOutcome(result)).toBe(expectation.category);
			});

			it("covers every documented fault case exactly once", () => {
				expect(Object.keys(provider.cases).sort()).toEqual([...FAULT_CASES].sort());
			});

			it("never attributes an unrecognized 401/403 to a plan, billing, or quota limit", async () => {
				for (const status of [401, 403]) {
					const result = await provider.call(raw("", status));
					const category = classifyProviderOutcome(result);
					expect(category).toBe("access_configuration");
					expect(category).not.toBe("plan_restricted");
					expect(category).not.toBe("quota_or_rate_limit");
					const diagnostic = buildProviderDiagnostic({
						providerClass: provider.providerClass,
						result,
						reference: "req-unknown-access",
						exposure: "detailed",
						now: new Date("2026-08-13T09:00:00.000Z"),
					});
					expect(JSON.stringify(diagnostic)).not.toMatch(/plan|billing|rozlicze|limit|kwot|quota/i);
				}
			});
		});
	}
});

describe("provider diagnostic exposure", () => {
	it.each([
		["local", "detailed"],
		["dev", "detailed"],
		["test", "detailed"],
		["staging", "detailed"],
		["production", "minimal"],
	] as const)("uses %s exposure %s", (environment, expected) => {
		expect(diagnosticExposure({ CLOUDFLARE_ENV: environment })).toBe(expected);
	});

	it("defaults an unknown environment to the safest exposure", () => {
		expect(diagnosticExposure({ CLOUDFLARE_ENV: "something-else" })).toBe("minimal");
		expect(diagnosticExposure({})).toBe("minimal");
	});
});

describe("provider diagnostic payload", () => {
	const failure = {
		status: "provider_error",
		httpStatus: 403,
		retryable: false,
		signal: "plan_feature_restricted",
	} as const;

	it("exposes provider class, category, UTC time, and correlation reference in staging", () => {
		expect(
			buildProviderDiagnostic({
				providerClass: "lot",
				result: failure,
				reference: "cf-ray-1234",
				exposure: "detailed",
				now: new Date("2026-08-13T09:15:30.000Z"),
			}),
		).toEqual({
			reference: "cf-ray-1234",
			occurredAtUtc: "2026-08-13T09:15:30.000Z",
			recovery: "manual",
			providerClass: "lot",
			category: "plan_restricted",
		});
	});

	it("keeps only the correlation reference, time, and action in production", () => {
		expect(
			buildProviderDiagnostic({
				providerClass: "lot",
				result: failure,
				reference: "cf-ray-1234",
				exposure: "minimal",
				now: new Date("2026-08-13T09:15:30.000Z"),
			}),
		).toEqual({
			reference: "cf-ray-1234",
			occurredAtUtc: "2026-08-13T09:15:30.000Z",
			recovery: "manual",
		});
	});

	it.each([
		["lot", "provider_coverage", "change_parameters"],
		["lot", "transient_outage", "retry"],
		["lot", "access_configuration", "manual"],
		["miejsce", "provider_coverage", "change_parameters"],
		["miejsce", "malformed_response", "change_parameters"],
		["miejsce", "access_configuration", "retry"],
		["trasa", "provider_coverage", "change_parameters"],
		["trasa", "plan_restricted", "manual"],
		["trasa", "quota_or_rate_limit", "retry"],
	] as const)("maps %s + %s to the %s action", (providerClass, category, recovery) => {
		const byCategory = {
			provider_coverage: { status: "zero_result" } as const,
			transient_outage: { status: "timeout", retryable: true } as const,
			access_configuration: {
				status: "provider_error",
				httpStatus: 403,
				retryable: false,
			} as const,
			malformed_response: { status: "malformed_response" } as const,
			plan_restricted: {
				status: "provider_error",
				httpStatus: 403,
				retryable: false,
				signal: "plan_feature_restricted",
			} as const,
			quota_or_rate_limit: { status: "rate_limited", retryable: true } as const,
		};
		expect(
			buildProviderDiagnostic({
				providerClass,
				result: byCategory[category],
				reference: "cf-ray-1234",
				exposure: "detailed",
				now: new Date("2026-08-13T09:15:30.000Z"),
			}).recovery,
		).toBe(recovery);
	});

	it("never carries a raw provider message, payload, or credential", async () => {
		const result = await providers[0]?.call(
			json(
				{
					error: {
						code: "function_access_restricted",
						message: "access_key=SECRET-VALUE is not entitled",
					},
				},
				403,
			),
		);
		const diagnostic = buildProviderDiagnostic({
			providerClass: "lot",
			result: result as ProviderResult<unknown, unknown>,
			reference: "cf-ray-1234",
			exposure: "detailed",
			now: new Date("2026-08-13T09:15:30.000Z"),
		});
		const serialized = JSON.stringify(diagnostic);
		expect(serialized).not.toContain("SECRET-VALUE");
		expect(serialized).not.toContain("access_key");
		expect(serialized).not.toContain("entitled");
	});
});
