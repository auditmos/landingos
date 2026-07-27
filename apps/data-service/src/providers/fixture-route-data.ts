import { FIXTURE_PROVENANCE, type FixtureScenario } from "./fixture-shared";
import type { ProviderResult, TransitRoute, TransitRouteInput } from "./types";

export interface RouteFixtureScenario
	extends FixtureScenario<TransitRouteInput, ProviderResult<TransitRoute[], TransitRoute>> {
	destinationLabel: string;
}

interface RouteSpec {
	key: string;
	destinationLabel: string;
	destination: { latitude: number; longitude: number };
	departureTime: string;
	durationMinutes: number;
	walkingMinutes: number;
	transfers: number;
}

const ROUTE_SPECS: RouteSpec[] = [
	{
		key: "bgy-centrale:day",
		destinationLabel: "Milano Centrale",
		destination: { latitude: 45.486167, longitude: 9.204463 },
		departureTime: "2026-09-14T11:05:00+02:00",
		durationMinutes: 55,
		walkingMinutes: 5,
		transfers: 0,
	},
	{
		key: "bgy-duomo:day",
		destinationLabel: "Duomo",
		destination: { latitude: 45.464098, longitude: 9.191926 },
		departureTime: "2026-09-14T11:05:00+02:00",
		durationMinutes: 65,
		walkingMinutes: 8,
		transfers: 0,
	},
	{
		key: "bgy-navigli:afternoon",
		destinationLabel: "Navigli",
		destination: { latitude: 45.451745, longitude: 9.174054 },
		departureTime: "2026-09-15T15:20:00+02:00",
		durationMinutes: 78,
		walkingMinutes: 10,
		transfers: 1,
	},
	{
		key: "bgy-porta-garibaldi:morning",
		destinationLabel: "Porta Garibaldi",
		destination: { latitude: 45.4848, longitude: 9.1877 },
		departureTime: "2026-09-16T09:15:00+02:00",
		durationMinutes: 70,
		walkingMinutes: 7,
		transfers: 1,
	},
	{
		key: "bgy-centrale:late",
		destinationLabel: "Milano Centrale",
		destination: { latitude: 45.486167, longitude: 9.204463 },
		departureTime: "2026-09-17T22:30:00+02:00",
		durationMinutes: 68,
		walkingMinutes: 6,
		transfers: 0,
	},
	{
		key: "bgy-duomo:morning",
		destinationLabel: "Duomo",
		destination: { latitude: 45.464098, longitude: 9.191926 },
		departureTime: "2026-09-18T07:45:00+02:00",
		durationMinutes: 64,
		walkingMinutes: 8,
		transfers: 1,
	},
	{
		key: "bgy-navigli:evening",
		destinationLabel: "Navigli",
		destination: { latitude: 45.451745, longitude: 9.174054 },
		departureTime: "2026-09-19T19:10:00+02:00",
		durationMinutes: 80,
		walkingMinutes: 11,
		transfers: 1,
	},
	{
		key: "bgy-porta-garibaldi:afternoon",
		destinationLabel: "Porta Garibaldi",
		destination: { latitude: 45.4848, longitude: 9.1877 },
		departureTime: "2026-09-20T13:40:00+02:00",
		durationMinutes: 69,
		walkingMinutes: 7,
		transfers: 1,
	},
	{
		key: "bgy-centrale:weekend",
		destinationLabel: "Milano Centrale",
		destination: { latitude: 45.486167, longitude: 9.204463 },
		departureTime: "2026-09-21T16:55:00+02:00",
		durationMinutes: 58,
		walkingMinutes: 5,
		transfers: 0,
	},
	{
		key: "bgy-cadorna:day",
		destinationLabel: "Milano Cadorna",
		destination: { latitude: 45.4682, longitude: 9.1766 },
		departureTime: "2026-09-22T12:25:00+02:00",
		durationMinutes: 72,
		walkingMinutes: 8,
		transfers: 1,
	},
];

function createTransitRoute(spec: RouteSpec): TransitRoute {
	const connectorDuration = spec.durationMinutes - 50 - spec.walkingMinutes;
	const walkingMeters = spec.walkingMinutes * 75;
	return {
		id: `fixture:route:${spec.key}`,
		departureTime: spec.departureTime,
		arrivalTime: new Date(
			new Date(spec.departureTime).getTime() + spec.durationMinutes * 60_000,
		).toISOString(),
		durationMinutes: spec.durationMinutes,
		transfers: spec.transfers,
		walkingMinutes: spec.walkingMinutes,
		walkingMeters,
		legs: [
			{
				mode: "bus",
				from: "Aeroporto BGY",
				to: "Milano Centrale",
				durationMinutes: 50,
				walkingMeters: 0,
			},
			{
				mode: "metro",
				from: "Centrale FS",
				to: spec.destinationLabel === "Duomo" ? "Duomo" : spec.destinationLabel,
				durationMinutes: connectorDuration,
				walkingMeters: 0,
			},
			{
				mode: "walk",
				from: spec.destinationLabel === "Duomo" ? "Duomo M1/M3" : spec.destinationLabel,
				to: spec.destinationLabel === "Duomo" ? "Duomo di Milano" : spec.destinationLabel,
				durationMinutes: spec.walkingMinutes,
				walkingMeters,
			},
		],
		fare: {
			currency: "EUR",
			amountMinor: 1_500,
			completeness: "complete",
		},
		source: {
			kind: "fixture",
			label: FIXTURE_PROVENANCE,
		},
	};
}

const BGY_COORDINATE = { latitude: 45.6739, longitude: 9.7042 };

const successfulRoutes: RouteFixtureScenario[] = ROUTE_SPECS.map((spec) => ({
	scenarioId: `route:${spec.key}`,
	provenance: FIXTURE_PROVENANCE,
	destinationLabel: spec.destinationLabel,
	input: {
		origin: BGY_COORDINATE,
		destination: spec.destination,
		departureTime: spec.departureTime,
	},
	result: {
		status: "success",
		value: [createTransitRoute(spec)],
	},
}));

function faultRouteInput(day: string): TransitRouteInput {
	return {
		origin: BGY_COORDINATE,
		destination: { latitude: 45.464098, longitude: 9.191926 },
		departureTime: `2026-10-${day}T11:05:00+02:00`,
	};
}

const faultRoutes: RouteFixtureScenario[] = [
	{
		scenarioId: "route:ambiguous",
		provenance: FIXTURE_PROVENANCE,
		destinationLabel: "Duomo",
		input: faultRouteInput("01"),
		result: {
			status: "ambiguous",
			options: [
				createTransitRoute(ROUTE_SPECS[1] as RouteSpec),
				createTransitRoute(ROUTE_SPECS[5] as RouteSpec),
			],
		},
	},
	{
		scenarioId: "route:zero-result",
		provenance: FIXTURE_PROVENANCE,
		destinationLabel: "Duomo",
		input: faultRouteInput("02"),
		result: { status: "zero_result" },
	},
	{
		scenarioId: "route:timeout",
		provenance: FIXTURE_PROVENANCE,
		destinationLabel: "Duomo",
		input: faultRouteInput("03"),
		result: { status: "timeout", retryable: true },
	},
	{
		scenarioId: "route:rate-limited",
		provenance: FIXTURE_PROVENANCE,
		destinationLabel: "Duomo",
		input: faultRouteInput("04"),
		result: { status: "rate_limited", retryable: true },
	},
	{
		scenarioId: "route:provider-error",
		provenance: FIXTURE_PROVENANCE,
		destinationLabel: "Duomo",
		input: faultRouteInput("05"),
		result: {
			status: "provider_error",
			httpStatus: 500,
			retryable: true,
		},
	},
	{
		scenarioId: "route:incomplete",
		provenance: FIXTURE_PROVENANCE,
		destinationLabel: "Duomo",
		input: faultRouteInput("06"),
		result: {
			status: "incomplete_response",
			missingFields: ["routes.legs"],
		},
	},
	{
		scenarioId: "route:malformed",
		provenance: FIXTURE_PROVENANCE,
		destinationLabel: "Duomo",
		input: faultRouteInput("07"),
		result: { status: "malformed_response" },
	},
];

export const ROUTE_FIXTURE_SCENARIOS: RouteFixtureScenario[] = [
	...successfulRoutes,
	...faultRoutes,
];
