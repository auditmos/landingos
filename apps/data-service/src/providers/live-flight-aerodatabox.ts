import { type ProviderFetch, requestProviderJson } from "./live-http";
import type { FlightProvider, ProviderFlight, ProviderResult } from "./types";

const AERODATABOX_HOST = "aerodatabox.p.rapidapi.com";

interface AerodataboxFlightConfig {
	aerodataboxRapidApiKey: string;
}

interface AerodataboxAirport {
	iata?: unknown;
	name?: unknown;
	countryCode?: unknown;
	timeZone?: unknown;
}

interface AerodataboxMovement {
	airport?: AerodataboxAirport;
	scheduledTime?: {
		local?: unknown;
		utc?: unknown;
	};
}

interface AerodataboxFlight {
	number?: unknown;
	codeshareStatus?: unknown;
	airline?: {
		name?: unknown;
		iata?: unknown;
		icao?: unknown;
	};
	departure?: AerodataboxMovement;
	arrival?: AerodataboxMovement;
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function designator(value: unknown): string | null {
	const normalized = text(value)?.replaceAll(" ", "").toUpperCase();
	return normalized && /^[A-Z0-9]{2}\d{1,4}$/.test(normalized) ? normalized : null;
}

function instant(value: unknown): string | null {
	const raw = text(value);
	if (!raw) return null;
	const normalized = raw.replace(" ", "T");
	if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)) return null;
	const timestamp = Date.parse(normalized);
	return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeFlight(
	raw: AerodataboxFlight,
	flightNumber: string,
	date: string,
): ProviderResult<ProviderFlight> {
	if (text(raw.codeshareStatus) !== "IsOperator") {
		return {
			status: "incomplete_response",
			missingFields: ["operatingCarrierCode", "operatingFlightNumber"],
		};
	}
	const rawNumber = designator(raw.number);
	const airlineCode = text(raw.airline?.iata)?.toUpperCase() ?? null;
	const numberMatch = rawNumber?.match(/^([A-Z0-9]{2})(\d{1,4})$/);
	const carrier = text(raw.airline?.name) ?? airlineCode;
	const operatingCarrierCode = airlineCode ?? numberMatch?.[1] ?? null;
	const operatingFlightNumber = numberMatch?.[2] ?? null;
	const originIata = text(raw.departure?.airport?.iata)?.toUpperCase() ?? null;
	const originName = text(raw.departure?.airport?.name);
	const destinationIata = text(raw.arrival?.airport?.iata)?.toUpperCase() ?? null;
	const destinationName = text(raw.arrival?.airport?.name);
	const scheduledArrival =
		instant(raw.arrival?.scheduledTime?.utc) ?? instant(raw.arrival?.scheduledTime?.local);
	const timeZone = text(raw.arrival?.airport?.timeZone);
	const fields = {
		carrier,
		operatingCarrierCode,
		operatingFlightNumber,
		originIata,
		originName,
		destinationIata,
		destinationName,
		scheduledArrival,
		timeZone,
	};
	const missingFields = Object.entries(fields)
		.filter(([, value]) => !value)
		.map(([field]) => field);
	if (missingFields.length > 0) return { status: "incomplete_response", missingFields };

	return {
		status: "success",
		value: {
			id: `${flightNumber.toLowerCase()}:${date}:${originIata?.toLowerCase()}-${destinationIata?.toLowerCase()}`,
			carrier: carrier as string,
			flightNumber,
			operatingCarrierCode: operatingCarrierCode as string,
			operatingFlightNumber: operatingFlightNumber as string,
			date,
			origin: { iata: originIata as string, name: originName as string },
			destination: { iata: destinationIata as string, name: destinationName as string },
			scheduledArrival: scheduledArrival as string,
			timeZone: timeZone as string,
		},
	};
}

function normalizeResponse(
	response: unknown,
	flightNumber: string,
	date: string,
): ProviderResult<ProviderFlight> {
	if (!Array.isArray(response)) {
		return { status: "incomplete_response", missingFields: ["root"] };
	}
	const matching = response.filter(
		(raw): raw is AerodataboxFlight =>
			typeof raw === "object" &&
			raw !== null &&
			designator((raw as AerodataboxFlight).number) === flightNumber &&
			text((raw as AerodataboxFlight).departure?.scheduledTime?.local)?.slice(0, 10) === date &&
			text((raw as AerodataboxFlight).departure?.airport?.countryCode)?.toUpperCase() === "PL" &&
			text((raw as AerodataboxFlight).arrival?.airport?.iata)?.toUpperCase() === "BGY",
	);
	if (matching.length === 0) return { status: "zero_result" };
	const results = matching.map((raw) => normalizeFlight(raw, flightNumber, date));
	const flights = results.flatMap((result) => (result.status === "success" ? [result.value] : []));
	const [first, ...rest] = flights;
	if (first) {
		return rest.length > 0
			? { status: "ambiguous", options: flights }
			: { status: "success", value: first };
	}
	return (
		results.find((result) => result.status === "incomplete_response") ?? {
			status: "zero_result",
		}
	);
}

export function createAerodataboxFlightProvider(
	config: AerodataboxFlightConfig,
	fetchImpl: ProviderFetch,
): FlightProvider {
	return {
		lookup: async (input) => {
			const flightNumber = input.flightNumber.trim().replaceAll(" ", "").toUpperCase();
			if (!/^[A-Z0-9]{2}\d{1,4}$/.test(flightNumber)) {
				return { status: "incomplete_response", missingFields: ["flightNumber"] };
			}
			const query = new URLSearchParams({
				dateLocalRole: "Both",
				withAircraftImage: "false",
				withLocation: "false",
				withFlightPlan: "false",
			});
			const result = await requestProviderJson<unknown>(
				fetchImpl,
				`https://${AERODATABOX_HOST}/flights/number/${encodeURIComponent(flightNumber)}/${encodeURIComponent(input.date)}?${query.toString()}`,
				{
					headers: {
						Accept: "application/json",
						"X-RapidAPI-Key": config.aerodataboxRapidApiKey,
						"X-RapidAPI-Host": AERODATABOX_HOST,
					},
				},
			);
			return result.status === "success"
				? normalizeResponse(result.value, flightNumber, input.date)
				: result;
		},
	};
}
