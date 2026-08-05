import {
	type JourneyCost,
	type JourneyRecommendationRequest,
	JourneyRecommendationRequestSchema,
	type JourneyRecommendationResult,
	JourneyRecommendationResultSchema,
	sanitizeJourneyExternalUrl,
} from "@repo/data-ops/journey";
import { analyticsFunnelHeaders, captureAnalyticsFunnel } from "./analytics-funnel";

const BGY_AIRPORT_COORDINATES = "45.673889,9.704167";

// Planner-only deep link: the private destination coordinates stay in the
// user's browser tab — never in room payloads, analytics, or logs.
export function journeyNavigationUrl(coordinates: {
	latitude: number;
	longitude: number;
}): string | null {
	return sanitizeJourneyExternalUrl(
		`https://www.google.com/maps/dir/?api=1&origin=${BGY_AIRPORT_COORDINATES}&destination=${coordinates.latitude},${coordinates.longitude}&travelmode=transit`,
	);
}

const API_URL = import.meta.env.VITE_DATA_SERVICE_URL || "http://localhost:8788";

type JourneyUnavailableResult = Extract<
	JourneyRecommendationResult,
	{ status: "recommendation_unavailable" }
>;

const OFFICIAL_BGY_MANUAL_ALTERNATIVE = {
	kind: "source" as const,
	label: "Sprawdź połączenia z lotniska",
	url: "https://www.milanbergamoairport.it/en/bus/",
};

export class JourneyApiError extends Error {
	constructor(
		readonly reason: JourneyUnavailableResult["reason"],
		message: string,
	) {
		super(message);
		this.name = "JourneyApiError";
	}
}

export async function recommendJourneysApi(
	rawInput: JourneyRecommendationRequest,
	signal?: AbortSignal,
	fetchImpl: typeof fetch = fetch,
): Promise<JourneyRecommendationResult> {
	const input = JourneyRecommendationRequestSchema.parse(rawInput);
	const response = await fetchImpl(`${API_URL}/journeys/recommend`, {
		method: "POST",
		headers: { "content-type": "application/json", ...analyticsFunnelHeaders() },
		body: JSON.stringify(input),
		signal,
	});
	captureAnalyticsFunnel(response);
	if (!response.ok) {
		throw new JourneyApiError(
			response.status === 429
				? "rate_limited"
				: response.status >= 500
					? "provider_error"
					: "incomplete",
			response.status === 400
				? "Sprawdź parametry przejazdu."
				: "Nie udało się pobrać tras. Spróbuj ponownie.",
		);
	}
	const parsed = JourneyRecommendationResultSchema.safeParse(
		await response.json().catch(() => undefined),
	);
	if (!parsed.success) {
		throw new JourneyApiError("incomplete", "Dane tras są niepełne lub nieprawidłowe.");
	}
	return parsed.data;
}

export function journeyUnavailableFromError(error: unknown): JourneyUnavailableResult {
	return {
		status: "recommendation_unavailable",
		reason: error instanceof JourneyApiError ? error.reason : "provider_error",
		manualAlternatives: [OFFICIAL_BGY_MANUAL_ALTERNATIVE],
	};
}

function formatEuro(minor: number): string {
	return new Intl.NumberFormat("pl-PL", {
		style: "currency",
		currency: "EUR",
	}).format(minor / 100);
}

export function formatJourneyCost(cost: JourneyCost): string {
	if (cost.completeness === "unknown" || cost.minorMin === null) {
		return "Brak pełnej ceny";
	}
	if (cost.completeness === "complete" && cost.minorMax === cost.minorMin) {
		return formatEuro(cost.minorMin);
	}
	if (cost.minorMax === null) {
		return `od ${formatEuro(cost.minorMin)} (cena niegwarantowana)`;
	}
	return `${formatEuro(cost.minorMin)}–${formatEuro(cost.minorMax)} (zakres, cena niegwarantowana)`;
}

export function formatJourneyArrival(instant: string): string {
	return new Intl.DateTimeFormat("pl-PL", {
		timeZone: "Europe/Rome",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(new Date(instant));
}

export const journeyFailureCopy = {
	zero_result: "Nie znaleźliśmy wiarygodnej trasy dla tych parametrów.",
	no_post_arrival_route: "Dostępne wyniki odjeżdżają przed końcem wybranego bufora.",
	no_complete_itinerary: "Dostępne dane nie tworzą kompletnej trasy.",
	timeout: "Dostawca tras nie odpowiedział na czas.",
	rate_limited: "Dostawca tras jest chwilowo przeciążony.",
	provider_error: "Dostawca tras jest chwilowo niedostępny.",
	incomplete: "Dane tras są niepełne lub nieprawidłowe.",
} as const;

export const journeyBadgeCopy = {
	recommended: "Rekomendowana",
	fastest: "Najszybsza",
	simplest: "Najprostsza",
} as const;
