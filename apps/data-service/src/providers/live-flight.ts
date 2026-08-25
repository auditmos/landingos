import { type ProviderFetch, requestProviderJson } from "./live-http";
import type { FlightProvider, ProviderFlight, ProviderResult } from "./types";

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

type NormalizedFlight =
	| { ok: true; flight: ProviderFlight }
	| { ok: false; missingFields: string[] };

/**
 * The presence check *produces* the typed record, so a field can never be read
 * out of `fields` without having been checked — the field list and the object
 * that feeds it are the same object, and the compiler keeps them in sync.
 * `missingFields` follows the literal's key order, which is what callers pin.
 */
function requireStrings<K extends string>(
	fields: Record<K, unknown>,
): { ok: true; value: Record<K, string> } | { ok: false; missingFields: K[] } {
	const missingFields: K[] = [];
	const value = {} as Record<K, string>;
	for (const [field, raw] of Object.entries(fields) as Array<[K, unknown]>) {
		if (typeof raw === "string" && raw.length > 0) value[field] = raw;
		else missingFields.push(field);
	}
	return missingFields.length > 0 ? { ok: false, missingFields } : { ok: true, value };
}

/** Both endpoints fold the same way: first incomplete row wins, >1 match is ambiguous. */
function foldFlights<T>(
	raws: T[],
	normalize: (raw: T) => NormalizedFlight,
): ProviderResult<ProviderFlight> {
	const flights: ProviderFlight[] = [];
	for (const raw of raws) {
		const normalized = normalize(raw);
		if (!normalized.ok) {
			return { status: "incomplete_response", missingFields: normalized.missingFields };
		}
		flights.push(normalized.flight);
	}
	const [first, ...rest] = flights;
	if (!first) return { status: "zero_result" };
	return rest.length > 0
		? { status: "ambiguous", options: flights }
		: { status: "success", value: first };
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
): NormalizedFlight {
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
	const required = requireStrings({
		carrier:
			typeof marketingAirline?.name === "string" && marketingAirline.name.trim()
				? marketingAirline.name.trim()
				: marketingAirline?.iataCode,
		operatingCarrierCode: raw.airline?.iataCode,
		operatingFlightNumber: raw.flight?.number,
		originIata,
		destinationIata,
		scheduledArrival: scheduledArrival ?? "",
	});
	if (!required.ok) return required;
	const fields = required.value;
	return {
		ok: true,
		flight: {
			id: `${flightNumber.toLowerCase()}:${date}:${originIata.toLowerCase()}-${destinationIata.toLowerCase()}`,
			carrier: fields.carrier,
			flightNumber,
			operatingCarrierCode: fields.operatingCarrierCode.trim().toUpperCase(),
			operatingFlightNumber: fields.operatingFlightNumber.trim(),
			date,
			origin: { iata: originIata, name: originIata },
			destination: { iata: destinationIata, name: destinationIata },
			scheduledArrival: fields.scheduledArrival,
			timeZone: "Europe/Rome",
		},
	};
}

function normalizeFutureResponse(
	response: AviationstackFutureResponse,
	date: string,
	flightNumber: string,
): ProviderResult<ProviderFlight> {
	if (!Array.isArray(response.data)) {
		return { status: "incomplete_response", missingFields: ["data"] };
	}
	const matching = response.data.filter((raw) => futureDesignator(raw, flightNumber));
	if (matching.length === 0) return { status: "zero_result" };
	return foldFlights(matching, (raw) => normalizeFutureFlight(raw, date, flightNumber));
}

function normalizeFlight(raw: AviationstackFlight, date: string): NormalizedFlight {
	const marketingFlight =
		typeof raw.flight?.iata === "string" ? raw.flight.iata.trim().toUpperCase() : "";
	const marketingMatch = /^([A-Z0-9]{2})(\d{1,4})$/.exec(marketingFlight);
	const codeshareCarrier = raw.flight?.codeshared?.airline_iata;
	const codeshareNumber = raw.flight?.codeshared?.flight_number;
	const required = requireStrings({
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
	});
	if (!required.ok) return required;
	const fields = required.value;
	const flightNumber = fields.flightNumber.toUpperCase();
	const originIata = fields.originIata.toUpperCase();
	const destinationIata = fields.destinationIata.toUpperCase();
	return {
		ok: true,
		flight: {
			id: `${flightNumber.toLowerCase()}:${date}:${originIata.toLowerCase()}-${destinationIata.toLowerCase()}`,
			carrier: fields.carrier,
			flightNumber,
			operatingCarrierCode: fields.operatingCarrierCode,
			operatingFlightNumber: fields.operatingFlightNumber,
			date,
			origin: {
				iata: originIata,
				name: fields.originName,
			},
			destination: {
				iata: destinationIata,
				name: fields.destinationName,
			},
			scheduledArrival: fields.scheduledArrival,
			timeZone: fields.timeZone,
		},
	};
}

function normalizeResponse(
	response: AviationstackResponse,
	date: string,
): ProviderResult<ProviderFlight> {
	if (!Array.isArray(response.data)) {
		return {
			status: "incomplete_response",
			missingFields: ["data"],
		};
	}
	if (response.data.length === 0) {
		return { status: "zero_result" };
	}
	return foldFlights(response.data, (raw) => normalizeFlight(raw, date));
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
