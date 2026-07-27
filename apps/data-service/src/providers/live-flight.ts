import { type ProviderFetch, requestProviderJson } from "./live-http";
import type { FlightInstance, FlightProvider, ProviderResult } from "./types";

interface LiveFlightConfig {
	aviationstackAccessKey: string;
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
): FlightProvider {
	return {
		lookup: async (input) => {
			const flightNumber = input.flightNumber.trim().toUpperCase();
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
