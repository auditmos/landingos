import type {
	FlightInstance,
	FlightLookupInput,
	ProviderResult,
	TransitRoute,
	TransitRouteInput,
} from "./types";

export const FIXTURE_PROVENANCE = "synthetic_recorded_for_testing" as const;

interface FixtureScenario<TInput, TResult> {
	scenarioId: string;
	provenance: typeof FIXTURE_PROVENANCE;
	input: TInput;
	result: TResult;
}

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
	return {
		id: `fixture:route:${spec.key}`,
		durationMinutes: spec.durationMinutes,
		transfers: spec.transfers,
		walkingMinutes: spec.walkingMinutes,
		legs: [
			{
				mode: "bus",
				from: "Aeroporto BGY",
				to: "Milano Centrale",
				durationMinutes: 50,
			},
			{
				mode: "metro",
				from: "Centrale FS",
				to: spec.destinationLabel === "Duomo" ? "Duomo" : spec.destinationLabel,
				durationMinutes: connectorDuration,
			},
			{
				mode: "walk",
				from: spec.destinationLabel === "Duomo" ? "Duomo M1/M3" : spec.destinationLabel,
				to: spec.destinationLabel === "Duomo" ? "Duomo di Milano" : spec.destinationLabel,
				durationMinutes: spec.walkingMinutes,
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
