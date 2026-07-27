import {
	type DestinationAutocompleteRequest,
	DestinationAutocompleteRequestSchema,
	type DestinationAutocompleteResult,
	DestinationAutocompleteResultSchema,
	type DestinationSelectionRequest,
	DestinationSelectionRequestSchema,
	type DestinationSelectionResult,
	DestinationSelectionResultSchema,
	type DestinationUnavailableReason,
} from "@repo/data-ops/destination";

const API_URL = import.meta.env.VITE_DATA_SERVICE_URL || "http://localhost:8788";
const DESTINATION_DEBOUNCE_MS = 250;

async function requestDestination<T>(
	path: string,
	body: DestinationAutocompleteRequest | DestinationSelectionRequest,
	schema: { parse(value: unknown): T },
	fetchImpl: typeof fetch,
	signal?: AbortSignal,
): Promise<T> {
	const response = await fetchImpl(`${API_URL}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
		signal,
	});
	if (!response.ok) {
		throw new Error(
			response.status === 400
				? "Sprawdź wpisane miejsce."
				: "Nie udało się połączyć z wyszukiwaniem. Spróbuj ponownie.",
		);
	}
	return schema.parse(await response.json());
}

export function autocompleteDestinationApi(
	rawInput: DestinationAutocompleteRequest,
	signal?: AbortSignal,
	fetchImpl: typeof fetch = fetch,
): Promise<DestinationAutocompleteResult> {
	const input = DestinationAutocompleteRequestSchema.parse(rawInput);
	return requestDestination(
		"/destinations/autocomplete",
		input,
		DestinationAutocompleteResultSchema,
		fetchImpl,
		signal,
	);
}

export function selectDestinationApi(
	rawInput: DestinationSelectionRequest,
	signal?: AbortSignal,
	fetchImpl: typeof fetch = fetch,
): Promise<DestinationSelectionResult> {
	const input = DestinationSelectionRequestSchema.parse(rawInput);
	return requestDestination(
		"/destinations/select",
		input,
		DestinationSelectionResultSchema,
		fetchImpl,
		signal,
	);
}

type Search = (query: string, signal: AbortSignal) => Promise<DestinationAutocompleteResult>;

export interface DestinationSearchScheduler {
	update(
		query: string,
		onResult: (result: DestinationAutocompleteResult) => void,
		onError?: (error: unknown) => void,
	): boolean;
	cancel(): void;
}

function isAbortError(error: unknown): boolean {
	return (
		(typeof DOMException !== "undefined" &&
			error instanceof DOMException &&
			error.name === "AbortError") ||
		(typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")
	);
}

export function createDestinationSearchScheduler(
	search: Search,
	delayMs = DESTINATION_DEBOUNCE_MS,
): DestinationSearchScheduler {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let activeController: AbortController | undefined;

	function cancel() {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
		activeController?.abort();
		activeController = undefined;
	}

	return {
		cancel,
		update: (rawQuery, onResult, onError) => {
			cancel();
			const query = rawQuery.trim();
			if (query.length < 3) return false;
			const controller = new AbortController();
			activeController = controller;
			timer = setTimeout(async () => {
				timer = undefined;
				try {
					const result = await search(query, controller.signal);
					if (!controller.signal.aborted) onResult(result);
				} catch (error) {
					if (!controller.signal.aborted && !isAbortError(error)) onError?.(error);
				} finally {
					if (activeController === controller) activeController = undefined;
				}
			}, delayMs);
			return true;
		},
	};
}

export function createDestinationSessionToken(): string {
	return crypto.randomUUID();
}

export const destinationReasonCopy: Record<DestinationUnavailableReason, string> = {
	not_found: "Nie znaleźliśmy pasującego miejsca.",
	timeout: "Wyszukiwanie nie odpowiedziało na czas.",
	rate_limited: "Wyszukiwanie jest chwilowo przeciążone.",
	provider_error: "Wyszukiwanie jest chwilowo niedostępne.",
	incomplete: "Dane miejsca są niepełne.",
};
