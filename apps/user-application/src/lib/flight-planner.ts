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
	captchaToken?: string,
): Promise<FlightResolveResult> {
	let response: Response;
	try {
		response = await fetchImpl(`${API_URL}${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...analyticsFunnelHeaders(),
				...(captchaToken ? { "x-captcha-response": captchaToken } : {}),
			},
			body: JSON.stringify(body),
		});
	} catch {
		throw new Error(
			"Nie udało się połączyć z planerem. Sprawdź, czy usługa danych działa, i spróbuj ponownie.",
		);
	}
	captureAnalyticsFunnel(response);
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as { status?: string } | null;
		if (payload?.status === "captcha_required" || payload?.status === "captcha_failed") {
			throw new Error("Potwierdź, że nie jesteś robotem i spróbuj ponownie.");
		}
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
	captchaToken?: string,
): Promise<FlightResolveResult> {
	const input = FlightLookupRequestSchema.parse(rawInput);
	return requestFlight("/flights/resolve", input, fetchImpl, captchaToken);
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
