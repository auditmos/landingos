import { FLIGHT_FIXTURE_SCENARIOS, ROUTE_FIXTURE_SCENARIOS } from "./fixture-data";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";
import type { ProviderAdapters, TransitRouteInput } from "./types";

const DUOMO_FIXTURE = {
	placeId: "fixture:place:duomo",
	displayText: "Duomo di Milano",
	coordinate: {
		latitude: 45.464098,
		longitude: 9.191926,
	},
} as const;

const AIRPORT_BUS_TRANSFER = {
	id: "fixture:transfer:airport-bus-centrale",
	operator: "Airport Bus Express",
	service: "BGY → Milano Centrale",
	sourceUrl: "https://www.milanbergamoairport.it/en/bus/",
	checkedOn: "2026-07-27",
	priceRange: {
		currency: "EUR",
		minorMin: 1_000,
		minorMax: 1_200,
	},
	purchaseUrl:
		"https://www.airportbusexpress.it/en-GB/bus-stop-timetable/bergamo-orio-al-serio-milan-central-station",
	provenance: "synthetic_recorded_for_testing",
} as const;

function coordinateKey(coordinate: { latitude: number; longitude: number }): string {
	return `${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`;
}

function routeInputKey(input: TransitRouteInput): string {
	return [coordinateKey(input.origin), coordinateKey(input.destination), input.departureTime].join(
		"|",
	);
}

export function createFixtureProviderAdapters(): ProviderAdapters {
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
			viewport: MILAN_MUNICIPALITY_VIEWPORT,
			autocomplete: async () => ({
				status: "success",
				value: [
					{
						placeId: DUOMO_FIXTURE.placeId,
						displayText: DUOMO_FIXTURE.displayText,
					},
				],
			}),
			details: async () => ({
				status: "success",
				value: DUOMO_FIXTURE,
			}),
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
