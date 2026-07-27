import { FIXTURE_PROVENANCE, type FixtureScenario } from "./fixture-shared";
import type { FlightInstance, FlightLookupInput, ProviderResult } from "./types";

export { FIXTURE_PROVENANCE } from "./fixture-shared";

export type FlightFixtureScenario = FixtureScenario<
	FlightLookupInput,
	ProviderResult<FlightInstance>
>;

interface FlightSpec {
	flightNumber: string;
	date: string;
	origin: string;
	originName: string;
	arrivalTime: string;
	carrier?: string;
	stableFlightId?: string;
	operatingCarrierCode?: string;
	operatingFlightNumber?: string;
}

const SUCCESS_FLIGHT_SPECS: FlightSpec[] = [
	{
		flightNumber: "FR1234",
		date: "2026-09-14",
		origin: "WAW",
		originName: "Lotnisko Chopina w Warszawie",
		arrivalTime: "10:20",
	},
	{
		flightNumber: "FR2137",
		date: "2026-09-15",
		origin: "KRK",
		originName: "Kraków Airport",
		arrivalTime: "12:05",
	},
	{
		flightNumber: "W61431",
		date: "2026-09-16",
		origin: "GDN",
		originName: "Port Lotniczy Gdańsk",
		arrivalTime: "08:30",
	},
	{
		flightNumber: "FR3591",
		date: "2026-09-17",
		origin: "WRO",
		originName: "Port Lotniczy Wrocław",
		arrivalTime: "14:40",
	},
	{
		flightNumber: "FR3473",
		date: "2026-09-18",
		origin: "POZ",
		originName: "Port Lotniczy Poznań-Ławica",
		arrivalTime: "17:15",
	},
	{
		flightNumber: "FR3669",
		date: "2026-09-19",
		origin: "KTW",
		originName: "Katowice Airport",
		arrivalTime: "20:30",
	},
	{
		flightNumber: "FR7149",
		date: "2026-09-20",
		origin: "RZE",
		originName: "Port Lotniczy Rzeszów-Jasionka",
		arrivalTime: "09:45",
	},
	{
		flightNumber: "FR3898",
		date: "2026-09-21",
		origin: "WMI",
		originName: "Port Lotniczy Warszawa-Modlin",
		arrivalTime: "23:10",
	},
	{
		flightNumber: "FR2597",
		date: "2026-09-22",
		origin: "SZZ",
		originName: "Port Lotniczy Szczecin-Goleniów",
		arrivalTime: "13:25",
	},
	{
		flightNumber: "W61433",
		date: "2026-09-23",
		origin: "LUZ",
		originName: "Port Lotniczy Lublin",
		arrivalTime: "19:55",
	},
];

function createFlightInstance(spec: FlightSpec): FlightInstance {
	const normalizedNumber = spec.flightNumber.toUpperCase();
	const carrierCode = normalizedNumber.slice(0, 2);
	const flightDigits = normalizedNumber.slice(2);
	const operatingCarrierCode = spec.operatingCarrierCode ?? carrierCode;
	const operatingFlightNumber = spec.operatingFlightNumber ?? flightDigits;
	return {
		id: `${normalizedNumber.toLowerCase()}:${spec.date}:${spec.origin.toLowerCase()}-bgy`,
		stableFlightId:
			spec.stableFlightId ??
			`${operatingCarrierCode}${operatingFlightNumber}:${spec.date}:${spec.origin}:BGY:${spec.arrivalTime}`,
		carrier: spec.carrier ?? (normalizedNumber.startsWith("W6") ? "Wizz Air" : "Ryanair"),
		flightNumber: normalizedNumber,
		operatingCarrierCode,
		operatingFlightNumber,
		date: spec.date,
		origin: {
			iata: spec.origin,
			name: spec.originName,
		},
		destination: {
			iata: "BGY",
			name: "Mediolan-Bergamo",
		},
		scheduledArrival: `${spec.date}T${spec.arrivalTime}:00+02:00`,
		timeZone: "Europe/Rome",
	};
}

const successfulFlights: FlightFixtureScenario[] = SUCCESS_FLIGHT_SPECS.map((spec) => ({
	scenarioId: `flight:${spec.flightNumber.toLowerCase()}:${spec.date}`,
	provenance: FIXTURE_PROVENANCE,
	input: {
		flightNumber: spec.flightNumber,
		date: spec.date,
	},
	result: {
		status: "success",
		value: createFlightInstance(spec),
	},
}));

const codeshareFlights: FlightFixtureScenario[] = [
	{
		scenarioId: "flight:codeshare:fr8123",
		provenance: FIXTURE_PROVENANCE,
		input: { flightNumber: "FR8123", date: "2026-10-02" },
		result: {
			status: "success",
			value: createFlightInstance({
				flightNumber: "FR8123",
				date: "2026-10-02",
				origin: "WAW",
				originName: "Lotnisko Chopina w Warszawie",
				arrivalTime: "12:30",
				stableFlightId: "fixture:operating:fr8123:2026-10-02",
			}),
		},
	},
	{
		scenarioId: "flight:codeshare:w69000",
		provenance: FIXTURE_PROVENANCE,
		input: { flightNumber: "W69000", date: "2026-10-02" },
		result: {
			status: "success",
			value: createFlightInstance({
				flightNumber: "W69000",
				date: "2026-10-02",
				origin: "WAW",
				originName: "Lotnisko Chopina w Warszawie",
				arrivalTime: "12:30",
				carrier: "Wizz Air",
				stableFlightId: "fixture:operating:fr8123:2026-10-02",
				operatingCarrierCode: "FR",
				operatingFlightNumber: "8123",
			}),
		},
	},
];

const ambiguousFlightA = createFlightInstance({
	flightNumber: "FX9001",
	date: "2026-10-01",
	origin: "WAW",
	originName: "Lotnisko Chopina w Warszawie",
	arrivalTime: "10:20",
});

const ambiguousFlightB = createFlightInstance({
	flightNumber: "FX9001",
	date: "2026-10-01",
	origin: "WMI",
	originName: "Port Lotniczy Warszawa-Modlin",
	arrivalTime: "10:40",
});

const faultFlights: FlightFixtureScenario[] = [
	{
		scenarioId: "flight:ambiguous",
		provenance: FIXTURE_PROVENANCE,
		input: { flightNumber: "FX9001", date: "2026-09-14" },
		result: {
			status: "ambiguous",
			options: [ambiguousFlightA, ambiguousFlightB],
		},
	},
	{
		scenarioId: "flight:zero-result",
		provenance: FIXTURE_PROVENANCE,
		input: { flightNumber: "FX9002", date: "2026-09-14" },
		result: { status: "zero_result" },
	},
	{
		scenarioId: "flight:timeout",
		provenance: FIXTURE_PROVENANCE,
		input: { flightNumber: "FX9003", date: "2026-09-14" },
		result: { status: "timeout", retryable: true },
	},
	{
		scenarioId: "flight:rate-limited",
		provenance: FIXTURE_PROVENANCE,
		input: { flightNumber: "FX9004", date: "2026-09-14" },
		result: { status: "rate_limited", retryable: true },
	},
	{
		scenarioId: "flight:provider-error",
		provenance: FIXTURE_PROVENANCE,
		input: { flightNumber: "FX9005", date: "2026-09-14" },
		result: {
			status: "provider_error",
			httpStatus: 500,
			retryable: true,
		},
	},
	{
		scenarioId: "flight:incomplete",
		provenance: FIXTURE_PROVENANCE,
		input: { flightNumber: "FX9006", date: "2026-09-14" },
		result: {
			status: "incomplete_response",
			missingFields: ["scheduledArrival"],
		},
	},
	{
		scenarioId: "flight:malformed",
		provenance: FIXTURE_PROVENANCE,
		input: { flightNumber: "FX9007", date: "2026-09-14" },
		result: { status: "malformed_response" },
	},
];

export const FLIGHT_FIXTURE_SCENARIOS: FlightFixtureScenario[] = [
	...successfulFlights,
	...codeshareFlights,
	...faultFlights,
];

export {
	ROUTE_FIXTURE_SCENARIOS,
	type RouteFixtureScenario,
} from "./fixture-route-data";
