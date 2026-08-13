import { type ProviderFetch, requestProviderJson } from "./live-http";
import type { FlightInstance, FlightProvider, ProviderResult } from "./types";

interface LiveFlightConfig {
	aviationstackAccessKey: string;
}

interface LiveFlightRuntime {
	today?: () => string;
}

interface AviationstackFlight {
	flight?: {
		iata?: unknown;
		codeshared?: {
			airline_iata?: unknown;
			flight_number?: unknown;
		};
	};
	airline?: { name?: unknown };
	departure?: { iata?: unknown; airport?: unknown };
	arrival?: {
		iata?: unknown;
		airport?: unknown;
		scheduled?: unknown;
		timezone?: unknown;
	};
}

interface AviationstackResponse {
	data?: AviationstackFlight[];
}

interface AviationstackFuturePoint {
	iataCode?: unknown;
	scheduledTime?: unknown;
}

interface AviationstackFutureIdentity {
	number?: unknown;
	iataNumber?: unknown;
}

interface AviationstackFutureAirline {
	name?: unknown;
	iataCode?: unknown;
}

interface AviationstackFutureFlight {
	departure?: AviationstackFuturePoint;
	arrival?: AviationstackFuturePoint;
	airline?: AviationstackFutureAirline;
	flight?: AviationstackFutureIdentity;
	codeshared?: {
		airline?: AviationstackFutureAirline;
		flight?: AviationstackFutureIdentity;
	} | null;
}

interface AviationstackFutureResponse {
	data?: AviationstackFutureFlight[];
}

function warsawToday(): string {
	const parts = new Intl.DateTimeFormat("en", {
		timeZone: "Europe/Warsaw",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());
	const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${value.year}-${value.month}-${value.day}`;
}

function romeOffset(date: string, time: string): string | null {
	const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
	if (!match) return null;
	const [year, month, day] = date.split("-").map(Number);
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	const second = Number(match[3] ?? "0");
	if (hour > 23 || minute > 59 || second > 59) return null;
	const localAsUtc = Date.UTC(year as number, (month as number) - 1, day, hour, minute, second);
	const formatter = new Intl.DateTimeFormat("en", {
		timeZone: "Europe/Rome",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	});
	function offsetAt(timestamp: number): number {
		const parts = Object.fromEntries(
			formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
		);
		const renderedAsUtc = Date.UTC(
			Number(parts.year),
			Number(parts.month) - 1,
			Number(parts.day),
			Number(parts.hour),
			Number(parts.minute),
			Number(parts.second),
		);
		return Math.round((renderedAsUtc - timestamp) / 60_000);
	}
	let offsetMinutes = offsetAt(localAsUtc);
	const instant = localAsUtc - offsetMinutes * 60_000;
	offsetMinutes = offsetAt(instant);
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const absolute = Math.abs(offsetMinutes);
	return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function romeScheduledArrival(fallbackDate: string, value: string): string | null {
	const timeOnly = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
	const datedLocal = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(value);
	const date = datedLocal?.[1] ?? fallbackDate;
	const hour = datedLocal?.[2] ?? timeOnly?.[1];
	const minute = datedLocal?.[3] ?? timeOnly?.[2];
	const second = datedLocal?.[4] ?? timeOnly?.[3] ?? "00";
	if (!hour || !minute || (!timeOnly && !datedLocal)) return null;
	const time = `${hour}:${minute}:${second}`;
	const offset = romeOffset(date, time);
	return offset ? `${date}T${time}${offset}` : null;
}

function futureDesignator(raw: AviationstackFutureFlight, flightNumber: string): boolean {
	return [raw.flight?.iataNumber, raw.codeshared?.flight?.iataNumber].some(
		(value) => typeof value === "string" && value.trim().toUpperCase() === flightNumber,
	);
}

function normalizeFutureFlight(
	raw: AviationstackFutureFlight,
	date: string,
	flightNumber: string,
): FlightInstance | string[] {
	const codeshareMatches =
		typeof raw.codeshared?.flight?.iataNumber === "string" &&
		raw.codeshared.flight.iataNumber.trim().toUpperCase() === flightNumber;
	const marketingAirline = codeshareMatches ? raw.codeshared?.airline : raw.airline;
	const originIata =
		typeof raw.departure?.iataCode === "string" ? raw.departure.iataCode.trim().toUpperCase() : "";
	const destinationIata =
		typeof raw.arrival?.iataCode === "string" ? raw.arrival.iataCode.trim().toUpperCase() : "";
	const arrivalTime =
		typeof raw.arrival?.scheduledTime === "string" ? raw.arrival.scheduledTime.trim() : "";
	const scheduledArrival = romeScheduledArrival(date, arrivalTime);
	const fields = {
		carrier:
			typeof marketingAirline?.name === "string" && marketingAirline.name.trim()
				? marketingAirline.name.trim()
				: marketingAirline?.iataCode,
		operatingCarrierCode: raw.airline?.iataCode,
		operatingFlightNumber: raw.flight?.number,
		originIata,
		destinationIata,
		scheduledArrival: scheduledArrival ?? "",
	};
	const missingFields = Object.entries(fields)
		.filter(([, value]) => typeof value !== "string" || value.length === 0)
		.map(([field]) => field);
	if (missingFields.length > 0) return missingFields;
	return {
		id: `${flightNumber.toLowerCase()}:${date}:${originIata.toLowerCase()}-${destinationIata.toLowerCase()}`,
		carrier: fields.carrier as string,
		flightNumber,
		operatingCarrierCode: (fields.operatingCarrierCode as string).trim().toUpperCase(),
		operatingFlightNumber: (fields.operatingFlightNumber as string).trim(),
		date,
		origin: { iata: originIata, name: originIata },
		destination: { iata: destinationIata, name: destinationIata },
		scheduledArrival: fields.scheduledArrival,
		timeZone: "Europe/Rome",
	};
}

function normalizeFutureResponse(
	response: AviationstackFutureResponse,
	date: string,
	flightNumber: string,
): ProviderResult<FlightInstance> {
	if (!Array.isArray(response.data)) {
		return { status: "incomplete_response", missingFields: ["data"] };
	}
	const matching = response.data.filter((raw) => futureDesignator(raw, flightNumber));
	if (matching.length === 0) return { status: "zero_result" };
	const flights: FlightInstance[] = [];
	for (const raw of matching) {
		const normalized = normalizeFutureFlight(raw, date, flightNumber);
		if (Array.isArray(normalized)) {
			return { status: "incomplete_response", missingFields: normalized };
		}
		flights.push(normalized);
	}
	if (flights.length > 1) return { status: "ambiguous", options: flights };
	return { status: "success", value: flights[0] as FlightInstance };
}

function normalizeFlight(raw: AviationstackFlight, date: string): FlightInstance | string[] {
	const missingFields: string[] = [];
	const marketingFlight =
		typeof raw.flight?.iata === "string" ? raw.flight.iata.trim().toUpperCase() : "";
	const marketingMatch = /^([A-Z0-9]{2})(\d{1,4})$/.exec(marketingFlight);
	const codeshareCarrier = raw.flight?.codeshared?.airline_iata;
	const codeshareNumber = raw.flight?.codeshared?.flight_number;
	const fields = {
		flightNumber: marketingFlight,
		operatingCarrierCode:
			typeof codeshareCarrier === "string"
				? codeshareCarrier.trim().toUpperCase()
				: marketingMatch?.[1],
		operatingFlightNumber:
			typeof codeshareNumber === "string" ? codeshareNumber.trim() : marketingMatch?.[2],
		carrier: raw.airline?.name,
		originIata: raw.departure?.iata,
		originName: raw.departure?.airport,
		destinationIata: raw.arrival?.iata,
		destinationName: raw.arrival?.airport,
		scheduledArrival: raw.arrival?.scheduled,
		timeZone: raw.arrival?.timezone,
	};
	for (const [field, value] of Object.entries(fields)) {
		if (typeof value !== "string" || value.length === 0) {
			missingFields.push(field);
		}
	}
	if (missingFields.length > 0) {
		return missingFields;
	}
	const flightNumber = (fields.flightNumber as string).toUpperCase();
	const originIata = (fields.originIata as string).toUpperCase();
	const destinationIata = (fields.destinationIata as string).toUpperCase();
	return {
		id: `${flightNumber.toLowerCase()}:${date}:${originIata.toLowerCase()}-${destinationIata.toLowerCase()}`,
		carrier: fields.carrier as string,
		flightNumber,
		operatingCarrierCode: fields.operatingCarrierCode as string,
		operatingFlightNumber: fields.operatingFlightNumber as string,
		date,
		origin: {
			iata: originIata,
			name: fields.originName as string,
		},
		destination: {
			iata: destinationIata,
			name: fields.destinationName as string,
		},
		scheduledArrival: fields.scheduledArrival as string,
		timeZone: fields.timeZone as string,
	};
}

function normalizeResponse(
	response: AviationstackResponse,
	date: string,
): ProviderResult<FlightInstance> {
	if (!Array.isArray(response.data)) {
		return {
			status: "incomplete_response",
			missingFields: ["data"],
		};
	}
	if (response.data.length === 0) {
		return { status: "zero_result" };
	}
	const flights: FlightInstance[] = [];
	for (const raw of response.data) {
		const normalized = normalizeFlight(raw, date);
		if (Array.isArray(normalized)) {
			return {
				status: "incomplete_response",
				missingFields: normalized,
			};
		}
		flights.push(normalized);
	}
	if (flights.length > 1) {
		return { status: "ambiguous", options: flights };
	}
	return { status: "success", value: flights[0] as FlightInstance };
}

export function createLiveFlightProvider(
	config: LiveFlightConfig,
	fetchImpl: ProviderFetch,
	runtime: LiveFlightRuntime = {},
): FlightProvider {
	return {
		lookup: async (input) => {
			const flightNumber = input.flightNumber.trim().toUpperCase();
			if (input.date > (runtime.today?.() ?? warsawToday())) {
				const match = /^([A-Z0-9]{2})(\d{1,4})$/.exec(flightNumber);
				if (!match) {
					return { status: "incomplete_response", missingFields: ["flightNumber"] };
				}
				const search = new URLSearchParams({
					access_key: config.aviationstackAccessKey,
					iataCode: "BGY",
					type: "arrival",
					date: input.date,
					airline_iata: match[1] as string,
					flight_number: match[2] as string,
					limit: "100",
				});
				const result = await requestProviderJson<AviationstackFutureResponse>(
					fetchImpl,
					`https://api.aviationstack.com/v1/flightsFuture?${search.toString()}`,
				);
				return result.status === "success"
					? normalizeFutureResponse(result.value, input.date, flightNumber)
					: result;
			}
			const search = new URLSearchParams({
				access_key: config.aviationstackAccessKey,
				flight_iata: flightNumber,
				flight_date: input.date,
			});
			const result = await requestProviderJson<AviationstackResponse>(
				fetchImpl,
				`https://api.aviationstack.com/v1/flights?${search.toString()}`,
			);
			return result.status === "success" ? normalizeResponse(result.value, input.date) : result;
		},
	};
}
