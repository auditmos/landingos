import { FLIGHT_FIXTURE_SCENARIOS, ROUTE_FIXTURE_SCENARIOS } from "./fixture-data";
import { createLiveProviderAdapters, type LiveProviderCredentials } from "./live-adapters";
import type { ProviderFetch } from "./live-http";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";
import type { ProviderResult } from "./types";

interface LiveSpikeOptions {
	credentials: LiveProviderCredentials;
	fetchImpl: ProviderFetch;
	nowMs: () => number;
	generatedAt: string;
	onProgress: (message: string) => void;
}

interface MeasuredScenarioResult {
	scenarioId: string;
	contract: "flight" | "places" | "transit";
	status: ProviderResult<unknown, unknown>["status"];
	latencyMs: number;
}

interface Coverage {
	total: number;
	successful: number;
}

interface EvidenceReference {
	provider: string;
	url: string;
	accessedOn: string;
}

export interface LiveSpikeEvidence {
	status: "complete";
	generatedAt: string;
	providers: {
		flight: "aviationstack";
		places: "google_places_new";
		transit: "google_routes_transit";
	};
	coverage: {
		flight: Coverage;
		places: Coverage;
		transit: Coverage;
	};
	resultQuality: {
		status: "unreviewed_against_official_sources";
	};
	callCount: number;
	latencyMs: {
		sampleCount: number;
		p50: number;
		p95: number;
	};
	billing: {
		units: {
			aviationstackCalls: number;
			googlePlacesAutocompleteCalls: number;
			googleRoutesComputeCalls: number;
		};
		cost: {
			status: "not_calculated_billing_export_required";
			currency: "USD";
			amount: null;
		};
	};
	viewport: typeof MILAN_MUNICIPALITY_VIEWPORT;
	sources: EvidenceReference[];
	providerTerms: EvidenceReference[];
	scenarioResults: MeasuredScenarioResult[];
}

const PLACE_QUERIES = [
	"Milano Centrale",
	"Duomo",
	"Navigli",
	"Porta Garibaldi",
	"Milano Cadorna",
] as const;

function percentile(values: number[], ratio: number): number {
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
	return sorted[index] ?? 0;
}

function coverageFor(
	results: MeasuredScenarioResult[],
	contract: MeasuredScenarioResult["contract"],
): Coverage {
	const matching = results.filter((result) => result.contract === contract);
	return {
		total: matching.length,
		successful: matching.filter((result) => result.status === "success").length,
	};
}

export async function runLiveSpike(options: LiveSpikeOptions): Promise<LiveSpikeEvidence> {
	const adapters = createLiveProviderAdapters(options.credentials, options.fetchImpl);
	const scenarioResults: MeasuredScenarioResult[] = [];

	async function measure(
		scenarioId: string,
		contract: MeasuredScenarioResult["contract"],
		call: () => Promise<ProviderResult<unknown, unknown>>,
	): Promise<void> {
		const startedAt = options.nowMs();
		const result = await call();
		const latencyMs = Math.max(0, options.nowMs() - startedAt);
		scenarioResults.push({
			scenarioId,
			contract,
			status: result.status,
			latencyMs,
		});
		options.onProgress(`[s0] ${scenarioResults.length}/25 ${contract} ${result.status}`);
	}

	const flightScenarios = FLIGHT_FIXTURE_SCENARIOS.filter(
		(scenario) => scenario.result.status === "success",
	).slice(0, 10);
	for (const scenario of flightScenarios) {
		await measure(scenario.scenarioId, "flight", () => adapters.flight.lookup(scenario.input));
	}

	for (const [index, query] of PLACE_QUERIES.entries()) {
		await measure(`place:${index + 1}`, "places", () =>
			adapters.places.autocomplete({ query, languageCode: "pl" }),
		);
	}

	const routeScenarios = ROUTE_FIXTURE_SCENARIOS.filter(
		(scenario) => scenario.result.status === "success",
	).slice(0, 10);
	for (const scenario of routeScenarios) {
		await measure(scenario.scenarioId, "transit", () => adapters.transit.route(scenario.input));
	}

	const latencies = scenarioResults.map((result) => result.latencyMs);
	const accessedOn = options.generatedAt.slice(0, 10);
	return {
		status: "complete",
		generatedAt: options.generatedAt,
		providers: {
			flight: "aviationstack",
			places: "google_places_new",
			transit: "google_routes_transit",
		},
		coverage: {
			flight: coverageFor(scenarioResults, "flight"),
			places: coverageFor(scenarioResults, "places"),
			transit: coverageFor(scenarioResults, "transit"),
		},
		resultQuality: {
			status: "unreviewed_against_official_sources",
		},
		callCount: scenarioResults.length,
		latencyMs: {
			sampleCount: latencies.length,
			p50: percentile(latencies, 0.5),
			p95: percentile(latencies, 0.95),
		},
		billing: {
			units: {
				aviationstackCalls: flightScenarios.length,
				googlePlacesAutocompleteCalls: PLACE_QUERIES.length,
				googleRoutesComputeCalls: routeScenarios.length,
			},
			cost: {
				status: "not_calculated_billing_export_required",
				currency: "USD",
				amount: null,
			},
		},
		viewport: MILAN_MUNICIPALITY_VIEWPORT,
		sources: [
			{
				provider: "aviationstack",
				url: "https://aviationstack.com/documentation",
				accessedOn,
			},
			{
				provider: "google_places_new",
				url: "https://developers.google.com/maps/documentation/places/web-service/place-autocomplete",
				accessedOn,
			},
			{
				provider: "google_routes_transit",
				url: "https://developers.google.com/maps/documentation/routes/transit-route",
				accessedOn,
			},
			{
				provider: "comune_di_milano",
				url: MILAN_MUNICIPALITY_VIEWPORT.source.url,
				accessedOn,
			},
		],
		providerTerms: [
			{
				provider: "aviationstack",
				url: "https://aviationstack.com/terms",
				accessedOn,
			},
			{
				provider: "google_maps_platform",
				url: "https://cloud.google.com/maps-platform/terms",
				accessedOn,
			},
			{
				provider: "google_maps_platform",
				url: "https://developers.google.com/maps/terms",
				accessedOn,
			},
		],
		scenarioResults,
	};
}
