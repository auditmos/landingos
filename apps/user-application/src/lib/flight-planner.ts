import {
	type FlightLookupRequest,
	FlightLookupRequestSchema,
	type FlightResolveResult,
	FlightResolveResultSchema,
	type ManualFlightRequest,
	ManualFlightRequestSchema,
} from "@repo/data-ops/flight";
import { analyticsFunnelHeaders, captureAnalyticsFunnel } from "./analytics-funnel";

const API_URL = import.meta.env.VITE_DATA_SERVICE_URL || "http://localhost:8788";

async function requestFlight(
	path: string,
	body: FlightLookupRequest | ManualFlightRequest,
	fetchImpl: typeof fetch,
): Promise<FlightResolveResult> {
	const response = await fetchImpl(`${API_URL}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", ...analyticsFunnelHeaders() },
		body: JSON.stringify(body),
	});
	captureAnalyticsFunnel(response);
	if (!response.ok) {
		const payload = await response.json().catch(() => null);
		throw new Error(
			response.status === 400 && payload
				? "Sprawdź poprawność danych lotu."
				: "Nie udało się połączyć z planerem. Spróbuj ponownie.",
		);
	}
	return FlightResolveResultSchema.parse(await response.json());
}

export function resolveFlightApi(
	rawInput: FlightLookupRequest,
	fetchImpl: typeof fetch = fetch,
): Promise<FlightResolveResult> {
	const input = FlightLookupRequestSchema.parse(rawInput);
	return requestFlight("/flights/resolve", input, fetchImpl);
}

export function completeManualFlightApi(
	rawInput: ManualFlightRequest,
	fetchImpl: typeof fetch = fetch,
): Promise<FlightResolveResult> {
	const input = ManualFlightRequestSchema.parse(rawInput);
	return requestFlight("/flights/manual", input, fetchImpl);
}

export function formatArrivalInRome(instant: string): string {
	return new Intl.DateTimeFormat("pl-PL", {
		timeZone: "Europe/Rome",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(new Date(instant));
}

export function formatDepartureDate(date: string): string {
	const [year, month, day] = date.split("-");
	return `${day}.${month}.${year}`;
}

export const manualReasonCopy: Record<
	Exclude<FlightResolveResult, { status: "recognized" }>["reason"],
	string
> = {
	not_found: "Nie znaleźliśmy tego lotu.",
	timeout: "Dostawca danych nie odpowiedział na czas.",
	rate_limited: "Dostawca danych jest chwilowo przeciążony.",
	provider_error: "Dostawca danych jest chwilowo niedostępny.",
	incomplete: "Dane lotu są niepełne.",
};
