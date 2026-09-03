import { BGY_ROUTE_ORIGIN, isAirportStopName } from "./bgy-origin";
import { ROUTE_FIXTURE_SCENARIOS } from "./fixture-data";
import { createLiveProviderAdapters, type LiveProviderCredentials } from "./live-adapters";
import { LIVE_FLIGHT_SAMPLE_V1, type ScheduledFlightSampleCase } from "./live-flight-sample";
import type { ProviderFetch } from "./live-http";
import { type Coordinate, MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";
import type { ProviderFlight, ProviderResult, TransitRoute } from "./types";

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
	/** Transit only: `from` stop of the first non-walk leg of the first returned route. */
	firstTransitDepartureStop?: string | null;
	/** Transit only: whether every returned route starts its transit at an airport stop. */
	departsFromAirportStop?: boolean;
}

interface AirportDepartureMeasurement {
	origin: Coordinate;
	routesMeasured: number;
	routesFromAirportStop: number;
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
		flight: "aviationstack" | "aerodatabox";
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
			| "reconfigure_aviationstack_for_scheduled_flight_coverage_or_replace_provider"
			| "reconfigure_aerodatabox_for_scheduled_flight_coverage_or_replace_provider";
	};
	airportDeparture: AirportDepartureMeasurement;
	callCount: number;
	latencyMs: {
		sampleCount: number;
		p50: number;
		p95: number;
	};
	billing: {
		units: {
			aviationstackCalls: number;
			aerodataboxCalls?: number;
			aerodataboxApiUnits?: number;
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
const AERODATABOX_INTERVAL_MS = 1_000;
const FLIGHT_WAIT_HEARTBEAT_MS = 30_000;
type LiveFlightProvider = LiveSpikeEvidence["providers"]["flight"];

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

function firstTransitDeparture(route: TransitRoute): string | null {
	return route.legs.find((leg) => leg.mode !== "walk")?.from ?? null;
}

function airportDepartureFor(result: ProviderResult<unknown, unknown>): Pick<
	MeasuredContractScenarioResult,
	"firstTransitDepartureStop" | "departsFromAirportStop"
> & {
	routes: TransitRoute[];
} {
	if (result.status !== "success" || !Array.isArray(result.value)) {
		return { routes: [], firstTransitDepartureStop: null, departsFromAirportStop: false };
	}
	const routes = result.value as TransitRoute[];
	const first = routes[0];
	return {
		routes,
		firstTransitDepartureStop: first ? firstTransitDeparture(first) : null,
		departsFromAirportStop:
			routes.length > 0 &&
			routes.every((route) => {
				const stop = firstTransitDeparture(route);
				return stop !== null && isAirportStopName(stop);
			}),
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

function flightRequestInterval(provider: LiveFlightProvider): number {
	return provider === "aerodatabox" ? AERODATABOX_INTERVAL_MS : AVIATIONSTACK_FUTURE_INTERVAL_MS;
}

async function waitForNextFlightRequest(
	caseNumber: number,
	total: number,
	intervalMs: number,
	options: Pick<LiveSpikeOptions, "onProgress" | "sleep">,
): Promise<void> {
	for (let waitedMs = 0; waitedMs < intervalMs; ) {
		const waitMs = Math.min(FLIGHT_WAIT_HEARTBEAT_MS, intervalMs - waitedMs);
		waitedMs += waitMs;
		options.onProgress(
			`[s0] flight provider wait ${caseNumber}/${total} ${waitedMs / 1_000}/${intervalMs / 1_000}s`,
		);
		await (options.sleep ?? sleep)(waitMs);
	}
}

function failedFlightDecision(provider: LiveFlightProvider) {
	return provider === "aerodatabox"
		? ("reconfigure_aerodatabox_for_scheduled_flight_coverage_or_replace_provider" as const)
		: ("reconfigure_aviationstack_for_scheduled_flight_coverage_or_replace_provider" as const);
}

function flightBillingUnits(provider: LiveFlightProvider, calls: number) {
	return provider === "aerodatabox"
		? { aviationstackCalls: 0, aerodataboxCalls: calls, aerodataboxApiUnits: calls * 2 }
		: { aviationstackCalls: calls };
}

function flightSourceUrl(provider: LiveFlightProvider): string {
	return provider === "aerodatabox"
		? "https://doc.aerodatabox.com/"
		: "https://aviationstack.com/documentation";
}

function flightTermsUrl(provider: LiveFlightProvider): string {
	return provider === "aerodatabox"
		? "https://rapidapi.com/aedbx-aedbx/api/aerodatabox/pricing"
		: "https://aviationstack.com/terms";
}

export async function runLiveSpike(options: LiveSpikeOptions): Promise<LiveSpikeEvidence> {
	const adapters = createLiveProviderAdapters(options.credentials, options.fetchImpl, {
		today: () => options.generatedAt.slice(0, 10),
	});
	const flightProvider = options.credentials.flightProvider ?? "aviationstack";
	const flightRequestIntervalMs = flightRequestInterval(flightProvider);
	const scenarioResults: MeasuredScenarioResult[] = [];
	const airportDeparture: AirportDepartureMeasurement = {
		origin: BGY_ROUTE_ORIGIN,
		routesMeasured: 0,
		routesFromAirportStop: 0,
	};

	async function measure(
		scenarioId: string,
		contract: MeasuredContractScenarioResult["contract"],
		call: () => Promise<ProviderResult<unknown, unknown>>,
	): Promise<void> {
		const startedAt = options.nowMs();
		const result = await call();
		const latencyMs = Math.max(0, options.nowMs() - startedAt);
		const measured: MeasuredContractScenarioResult = {
			scenarioId,
			contract,
			status: result.status,
			latencyMs,
		};
		if (contract === "transit") {
			const { routes, ...departure } = airportDepartureFor(result);
			Object.assign(measured, departure);
			airportDeparture.routesMeasured += routes.length;
			airportDeparture.routesFromAirportStop += routes.filter((route) => {
				const stop = firstTransitDeparture(route);
				return stop !== null && isAirportStopName(stop);
			}).length;
		}
		scenarioResults.push(measured);
		options.onProgress(`[s0] ${scenarioResults.length}/25 ${contract} ${result.status}`);
	}

	const flightScenarios = LIVE_FLIGHT_SAMPLE_V1.cases;
	for (const [index, scenario] of flightScenarios.entries()) {
		if (index > 0) {
			await waitForNextFlightRequest(
				index + 1,
				flightScenarios.length,
				flightRequestIntervalMs,
				options,
			);
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
			flight: flightProvider,
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
			requiredDecision: flightRecognitionPassing ? null : failedFlightDecision(flightProvider),
		},
		airportDeparture,
		callCount: scenarioResults.length,
		latencyMs: {
			sampleCount: latencies.length,
			p50: percentile(latencies, 0.5),
			p95: percentile(latencies, 0.95),
		},
		billing: {
			units: {
				...flightBillingUnits(flightProvider, flightScenarios.length),
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
				provider: flightProvider,
				url: flightSourceUrl(flightProvider),
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
				provider: flightProvider,
				url: flightTermsUrl(flightProvider),
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
