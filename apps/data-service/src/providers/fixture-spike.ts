import { createFixtureProviderAdapters } from "./fixture-adapters";
import {
	FIXTURE_PROVENANCE,
	FLIGHT_FIXTURE_SCENARIOS,
	type FlightFixtureScenario,
	ROUTE_FIXTURE_SCENARIOS,
	type RouteFixtureScenario,
} from "./fixture-data";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";
import type { ProviderResult } from "./types";

type ContractName = "flight" | "places" | "transit" | "transferCatalog";

type OutcomeStatus = ProviderResult<unknown, unknown>["status"];

export interface FixtureScenarioSummary {
	scenarioId: string;
	contract: ContractName;
	status: OutcomeStatus;
	normalizedIds: string[];
}

interface ContractSummary {
	total: number;
	successful: number;
	outcomes: Record<OutcomeStatus, number>;
}

export interface FixtureSpikeSummary {
	schemaVersion: "s0-provider-readiness-v1";
	mode: "fixture";
	datasetLabel: typeof FIXTURE_PROVENANCE;
	viewportVersion: "milan-municipality-v1";
	contracts: Record<ContractName, ContractSummary>;
	scenarioResults: FixtureScenarioSummary[];
}

interface RunFixtureSpikeOptions {
	flightScenarios?: FlightFixtureScenario[];
	routeScenarios?: RouteFixtureScenario[];
}

const OUTCOME_ORDER: OutcomeStatus[] = [
	"success",
	"ambiguous",
	"zero_result",
	"timeout",
	"rate_limited",
	"provider_error",
	"incomplete_response",
	"malformed_response",
];

function extractId(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}
	if ("id" in value && typeof value.id === "string") {
		return value.id;
	}
	if ("placeId" in value && typeof value.placeId === "string") {
		return value.placeId;
	}
	return undefined;
}

function extractNormalizedIds(value: unknown): string[] {
	const values = Array.isArray(value) ? value : [value];
	return values
		.map(extractId)
		.filter((id): id is string => id !== undefined)
		.sort();
}

function normalizeResult(
	scenarioId: string,
	contract: ContractName,
	result: ProviderResult<unknown, unknown>,
): FixtureScenarioSummary {
	const normalizedIds =
		result.status === "success"
			? extractNormalizedIds(result.value)
			: result.status === "ambiguous"
				? extractNormalizedIds(result.options)
				: [];
	return {
		scenarioId,
		contract,
		status: result.status,
		normalizedIds,
	};
}

function emptyOutcomes(): Record<OutcomeStatus, number> {
	return Object.fromEntries(OUTCOME_ORDER.map((status) => [status, 0])) as Record<
		OutcomeStatus,
		number
	>;
}

function summarizeContract(
	results: FixtureScenarioSummary[],
	contract: ContractName,
): ContractSummary {
	const matching = results.filter((result) => result.contract === contract);
	const outcomes = emptyOutcomes();
	for (const result of matching) {
		outcomes[result.status] += 1;
	}
	return {
		total: matching.length,
		successful: outcomes.success,
		outcomes,
	};
}

export async function runFixtureSpike(
	options: RunFixtureSpikeOptions = {},
): Promise<FixtureSpikeSummary> {
	const adapters = createFixtureProviderAdapters();
	const flightScenarios = options.flightScenarios ?? FLIGHT_FIXTURE_SCENARIOS;
	const routeScenarios = options.routeScenarios ?? ROUTE_FIXTURE_SCENARIOS;
	const scenarioResults: FixtureScenarioSummary[] = [];

	for (const scenario of flightScenarios) {
		const result = await adapters.flight.lookup(scenario.input);
		scenarioResults.push(normalizeResult(scenario.scenarioId, "flight", result));
	}
	for (const scenario of routeScenarios) {
		const result = await adapters.transit.route(scenario.input);
		scenarioResults.push(normalizeResult(scenario.scenarioId, "transit", result));
	}

	const placeAutocomplete = await adapters.places.autocomplete({
		query: "Duomo",
		languageCode: "pl",
	});
	scenarioResults.push(normalizeResult("place:duomo:autocomplete", "places", placeAutocomplete));
	const placeDetails = await adapters.places.details({
		placeId: "fixture:place:duomo",
	});
	scenarioResults.push(normalizeResult("place:duomo:details", "places", placeDetails));
	const transferCatalog = await adapters.transferCatalog.list();
	scenarioResults.push(
		normalizeResult("transfer-catalog:seeded", "transferCatalog", transferCatalog),
	);
	scenarioResults.sort((left, right) => left.scenarioId.localeCompare(right.scenarioId));

	return {
		schemaVersion: "s0-provider-readiness-v1",
		mode: "fixture",
		datasetLabel: FIXTURE_PROVENANCE,
		viewportVersion: MILAN_MUNICIPALITY_VIEWPORT.version,
		contracts: {
			flight: summarizeContract(scenarioResults, "flight"),
			places: summarizeContract(scenarioResults, "places"),
			transit: summarizeContract(scenarioResults, "transit"),
			transferCatalog: summarizeContract(scenarioResults, "transferCatalog"),
		},
		scenarioResults,
	};
}
