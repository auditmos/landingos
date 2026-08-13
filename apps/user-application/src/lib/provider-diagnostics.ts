import type {
	ProviderClass,
	ProviderDiagnostic,
	ProviderDiagnosticCategory,
	ProviderRecoveryAction,
} from "@repo/data-ops/diagnostics";

/**
 * Traveler-facing MVP notice. It states the third-party limitation without implying
 * the traveler entered anything wrong, and without attributing a specific plan,
 * billing state, or quota to any provider.
 */
export const MVP_PROVIDER_LIMIT_NOTICE =
	"LandingOS to MVP: korzystamy z ograniczonych planów zewnętrznych dostawców danych (rozkłady lotów, miejsca, trasy). Część zapytań może nie zwrócić wyniku, nawet gdy Twoje dane są poprawne.";

export const providerCategoryCopy: Record<ProviderDiagnosticCategory, string> = {
	quota_or_rate_limit: "Przekroczony limit zapytań lub przepustowości dostawcy",
	plan_restricted: "Funkcja niedostępna w planie wykupionym u dostawcy",
	access_configuration: "Dostawca odmówił dostępu — konfiguracja lub uprawnienia",
	provider_coverage: "Dostawca nie ma danych dla tego zapytania",
	transient_outage: "Chwilowa awaria lub przekroczony czas odpowiedzi",
	malformed_response: "Odpowiedź dostawcy była niepełna lub nieprawidłowa",
	unknown_provider_failure: "Nierozpoznana awaria po stronie dostawcy",
};

export const providerClassCopy: Record<ProviderClass, string> = {
	lot: "Dane lotu",
	miejsce: "Wyszukiwanie miejsc",
	trasa: "Wyznaczanie tras",
};

export const providerRecoveryCopy: Record<ProviderRecoveryAction, string> = {
	retry: "Ponowna próba ma sens — odczekaj chwilę i spróbuj jeszcze raz.",
	manual: "Ponowna próba nic teraz nie zmieni — skorzystaj z alternatywy ręcznej poniżej.",
	change_parameters: "Ponowna próba nic teraz nie zmieni — zmień wpisane dane i spróbuj ponownie.",
};

export interface ProviderOutcomeGuidance {
	retryable: boolean;
	recovery: ProviderRecoveryAction;
}

function guidance(recovery: ProviderRecoveryAction): ProviderOutcomeGuidance {
	return { recovery, retryable: recovery === "retry" };
}

/** Fallback guidance when a response carries no server diagnostic (older or offline path). */
export const flightOutcomeGuidance = {
	not_found: guidance("change_parameters"),
	timeout: guidance("retry"),
	rate_limited: guidance("retry"),
	provider_error: guidance("manual"),
	incomplete: guidance("manual"),
} as const satisfies Record<string, ProviderOutcomeGuidance>;

export const destinationOutcomeGuidance = {
	not_found: guidance("change_parameters"),
	timeout: guidance("retry"),
	rate_limited: guidance("retry"),
	provider_error: guidance("retry"),
	incomplete: guidance("change_parameters"),
} as const satisfies Record<string, ProviderOutcomeGuidance>;

export const journeyOutcomeGuidance = {
	zero_result: guidance("change_parameters"),
	no_post_arrival_route: guidance("change_parameters"),
	no_complete_itinerary: guidance("change_parameters"),
	timeout: guidance("retry"),
	rate_limited: guidance("retry"),
	provider_error: guidance("manual"),
	incomplete: guidance("manual"),
} as const satisfies Record<string, ProviderOutcomeGuidance>;

/** The server-side action wins whenever a diagnostic reached the browser. */
export function resolveRecovery(
	fallback: ProviderOutcomeGuidance,
	diagnostic?: ProviderDiagnostic,
): ProviderOutcomeGuidance {
	if (!diagnostic) return fallback;
	return { recovery: diagnostic.recovery, retryable: diagnostic.recovery === "retry" };
}

/** QA reads occurrence times in UTC so they line up with worker logs. */
export function formatDiagnosticTime(instant: string): string {
	const parsed = new Date(instant);
	if (Number.isNaN(parsed.valueOf())) return instant;
	return `${parsed.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
