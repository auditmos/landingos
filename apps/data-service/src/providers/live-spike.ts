import { ROUTE_FIXTURE_SCENARIOS } from "./fixture-data";
import { createLiveProviderAdapters, type LiveProviderCredentials } from "./live-adapters";
import { LIVE_FLIGHT_SAMPLE_V1, type ScheduledFlightSampleCase } from "./live-flight-sample";
import type { ProviderFetch } from "./live-http";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";
import type { ProviderFlight, ProviderResult } from "./types";

interface LiveSpikeOptions {
	credentials: LiveProviderCredentials;
	fetchImpl: ProviderFetch;
	nowMs: () => number;
	generatedAt: string;
	onProgress: (message: string) => void;
	sleep?: (milliseconds: number) => Promise<void>;
}

interface MeasuredContractScenarioResult {
	scenarioId: string;
	contract: "places" | "transit";
	status: ProviderResult<unknown, unknown>["status"];
	latencyMs: number;
}

interface MeasuredFlightScenarioResult {
	scenarioId: string;
	contract: "flight";
	status: ProviderResult<unknown, unknown>["status"];
	latencyMs: number;
	input: ScheduledFlightSampleCase["input"];
	reference: ScheduledFlightSampleCase["expected"];
	source: ScheduledFlightSampleCase["source"];
	normalizedOutcome:
		| { status: Exclude<ProviderResult<unknown>["status"], "success"> }
		| {
				status: "success";
				originIata: string;
				destinationIata: string;
				scheduledArrival: string;
				timeZone: string;
		  };
	accessedAt: string;
	correlationId: string;
	matchesExpected: boolean;
}

type MeasuredScenarioResult = MeasuredContractScenarioResult | MeasuredFlightScenarioResult;

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
	flightRecognition: {
		total: number;
		correct: number;
		requiredCorrect: number;
		status: "passing" | "failing";
		requiredDecision:
			| null
			| "reconfigure_aviationstack_for_scheduled_flight_coverage_or_replace_provider";
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

const AVIATIONSTACK_FUTURE_INTERVAL_MS = 60_000;
const FLIGHT_WAIT_HEARTBEAT_MS = 30_000;

function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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

function correlationId(caseId: string, generatedAt: string): string {
	return `flight:${caseId}:${generatedAt.replace(/[-:.]/g, "")}`;
}

function normalizeMeasuredFlight(result: ProviderResult<ProviderFlight>) {
	if (result.status !== "success") return { status: result.status };
	return {
		status: "success" as const,
		originIata: result.value.origin.iata,
		destinationIata: result.value.destination.iata,
		scheduledArrival: result.value.scheduledArrival,
		timeZone: result.value.timeZone,
	};
}

function flightMatchesReference(
	result: ProviderResult<ProviderFlight>,
	reference: ScheduledFlightSampleCase["expected"],
): boolean {
	return (
		result.status === "success" &&
		result.value.origin.iata === reference.originIata &&
		result.value.destination.iata === reference.destinationIata &&
		result.value.timeZone === reference.timeZone &&
		Date.parse(result.value.scheduledArrival) === Date.parse(reference.scheduledArrival)
	);
}

export async function runLiveSpike(options: LiveSpikeOptions): Promise<LiveSpikeEvidence> {
	const adapters = createLiveProviderAdapters(options.credentials, options.fetchImpl);
	const scenarioResults: MeasuredScenarioResult[] = [];

	async function measure(
		scenarioId: string,
		contract: MeasuredContractScenarioResult["contract"],
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

	const flightScenarios = LIVE_FLIGHT_SAMPLE_V1.cases;
	for (const [index, scenario] of flightScenarios.entries()) {
		if (index > 0) {
			for (
				let waitedMs = 0;
				waitedMs < AVIATIONSTACK_FUTURE_INTERVAL_MS;
				waitedMs += FLIGHT_WAIT_HEARTBEAT_MS
			) {
				const nextWaitedSeconds = (waitedMs + FLIGHT_WAIT_HEARTBEAT_MS) / 1_000;
				options.onProgress(
					`[s0] flight provider wait ${index + 1}/${flightScenarios.length} ${nextWaitedSeconds}/60s`,
				);
				await (options.sleep ?? sleep)(FLIGHT_WAIT_HEARTBEAT_MS);
			}
		}
		const startedAt = options.nowMs();
		const result = await adapters.flight.lookup(scenario.input);
		const latencyMs = Math.max(0, options.nowMs() - startedAt);
		const flightCorrelationId = correlationId(scenario.caseId, options.generatedAt);
		scenarioResults.push({
			scenarioId: `flight:${scenario.caseId}`,
			contract: "flight",
			status: result.status,
			latencyMs,
			input: scenario.input,
			reference: scenario.expected,
			source: scenario.source,
			normalizedOutcome: normalizeMeasuredFlight(result),
			accessedAt: options.generatedAt,
			correlationId: flightCorrelationId,
			matchesExpected: flightMatchesReference(result, scenario.expected),
		});
		options.onProgress(
			`[s0] ${scenarioResults.length}/25 flight ${result.status} ${flightCorrelationId}`,
		);
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
	const flightResults = scenarioResults.filter(
		(result): result is MeasuredFlightScenarioResult => result.contract === "flight",
	);
	const correctFlights = flightResults.filter((result) => result.matchesExpected).length;
	const requiredCorrect = Math.ceil(flightResults.length * 0.9);
	const flightRecognitionPassing = correctFlights >= requiredCorrect;
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
		flightRecognition: {
			total: flightResults.length,
			correct: correctFlights,
			requiredCorrect,
			status: flightRecognitionPassing ? "passing" : "failing",
			requiredDecision: flightRecognitionPassing
				? null
				: "reconfigure_aviationstack_for_scheduled_flight_coverage_or_replace_provider",
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
