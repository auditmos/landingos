import { FLIGHT_FIXTURE_SCENARIOS, ROUTE_FIXTURE_SCENARIOS } from "./fixture-data";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";
import type {
	Place,
	PlaceSuggestion,
	ProviderAdapters,
	ProviderResult,
	SupportedArea,
	TransitRouteInput,
} from "./types";

const PLACE_FIXTURES: Array<{
	queries: string[];
	prediction: PlaceSuggestion;
	details: Place;
}> = [
	{
		queries: ["duomo", "katedra"],
		prediction: {
			placeId: "fixture:place:duomo",
			primaryText: "Duomo di Milano",
			secondaryText: "Piazza del Duomo, Milano",
		},
		details: {
			placeId: "fixture:place:duomo",
			displayName: "Duomo di Milano",
			coordinate: { latitude: 45.464098, longitude: 9.191926 },
		},
	},
	{
		queries: ["via torino", "torino 42"],
		prediction: {
			placeId: "fixture:place:via-torino",
			primaryText: "Via Torino 42",
			secondaryText: "20123 Milano MI, Włochy",
		},
		details: {
			placeId: "fixture:place:via-torino",
			displayName: "Via Torino 42, Milano",
			coordinate: { latitude: 45.45946, longitude: 9.18444 },
		},
	},
	{
		queries: ["hotel berna", "berna"],
		prediction: {
			placeId: "fixture:place:hotel-berna",
			primaryText: "Hotel Berna",
			secondaryText: "Via Napo Torriani 18, Milano",
		},
		details: {
			placeId: "fixture:place:hotel-berna",
			displayName: "Hotel Berna",
			coordinate: { latitude: 45.48209, longitude: 9.20481 },
		},
	},
	{
		queries: [],
		prediction: {
			placeId: "fixture:place:bgy",
			primaryText: "Lotnisko Mediolan-Bergamo",
			secondaryText: "Orio al Serio, Bergamo",
		},
		details: {
			placeId: "fixture:place:bgy",
			displayName: "Lotnisko Mediolan-Bergamo",
			coordinate: { latitude: 45.6739, longitude: 9.7042 },
		},
	},
	{
		queries: [],
		prediction: {
			placeId: "fixture:boundary:low",
			primaryText: "Granica południowo-zachodnia",
			secondaryText: "Mediolan",
		},
		details: {
			placeId: "fixture:boundary:low",
			displayName: "Granica południowo-zachodnia",
			coordinate: MILAN_MUNICIPALITY_VIEWPORT.rectangle.low,
		},
	},
	{
		queries: [],
		prediction: {
			placeId: "fixture:boundary:high",
			primaryText: "Granica północno-wschodnia",
			secondaryText: "Mediolan",
		},
		details: {
			placeId: "fixture:boundary:high",
			displayName: "Granica północno-wschodnia",
			coordinate: MILAN_MUNICIPALITY_VIEWPORT.rectangle.high,
		},
	},
];

const PLACE_AUTOCOMPLETE_FAULTS: Record<
	string,
	ProviderResult<PlaceSuggestion[], PlaceSuggestion>
> = {
	"fixture timeout": { status: "timeout", retryable: true },
	"fixture limit": { status: "rate_limited", retryable: true },
	"fixture awaria": { status: "provider_error", httpStatus: 500, retryable: true },
	"fixture brak": { status: "zero_result" },
	"fixture uszkodzone": { status: "malformed_response" },
};

const AIRPORT_BUS_TRANSFER = {
	id: "bgy-airport-bus-centrale",
	operatorName: "Airport Bus Express",
	serviceName: "BGY → Milano Centrale",
	originIata: "BGY",
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
	purchaseUrl:
		"https://www.airportbusexpress.it/en-GB/bus-stop-timetable/bergamo-orio-al-serio-milan-central-station",
	publicationStatus: "published",
	provenance: "seeded_fixture",
	createdAt: "2026-07-27T00:00:00.000Z",
	updatedAt: "2026-07-27T00:00:00.000Z",
} as const;

function coordinateKey(coordinate: { latitude: number; longitude: number }): string {
	return `${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`;
}

function routeInputKey(input: TransitRouteInput): string {
	return [
		coordinateKey(input.origin),
		coordinateKey(input.destination),
		new Date(input.departureTime).toISOString(),
	].join("|");
}

export function createFixtureProviderAdapters(
	supportedArea: SupportedArea = MILAN_MUNICIPALITY_VIEWPORT,
): ProviderAdapters {
	return {
		mode: "fixture",
		flight: {
			lookup: async (input) =>
				FLIGHT_FIXTURE_SCENARIOS.find(
					(scenario) =>
						scenario.input.flightNumber.toUpperCase() === input.flightNumber.trim().toUpperCase() &&
						scenario.input.date === input.date,
				)?.result ?? { status: "zero_result" },
		},
		places: {
			viewport: supportedArea,
			autocomplete: async (input) => {
				const query = input.query.trim().toLocaleLowerCase("pl");
				const fault = PLACE_AUTOCOMPLETE_FAULTS[query];
				if (fault) return fault;
				const matches = PLACE_FIXTURES.filter((fixture) =>
					fixture.queries.some((candidate) => query.includes(candidate)),
				).map((fixture) => fixture.prediction);
				return matches.length > 0
					? { status: "success", value: matches }
					: { status: "zero_result" };
			},
			details: async (input) => {
				const fixture = PLACE_FIXTURES.find(
					(candidate) => candidate.details.placeId === input.placeId,
				);
				return fixture ? { status: "success", value: fixture.details } : { status: "zero_result" };
			},
		},
		transit: {
			route: async (input) =>
				ROUTE_FIXTURE_SCENARIOS.find(
					(scenario) => routeInputKey(scenario.input) === routeInputKey(input),
				)?.result ?? { status: "zero_result" },
		},
		transferCatalog: {
			list: async () => ({
				status: "success",
				value: [AIRPORT_BUS_TRANSFER],
			}),
		},
	};
}
