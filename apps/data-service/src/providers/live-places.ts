import { type ProviderFetch, requestProviderJson } from "./live-http";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";
import type {
	Place,
	PlaceSuggestion,
	PlacesProvider,
	ProviderResult,
	SupportedArea,
} from "./types";

interface LivePlacesConfig {
	googleMapsApiKey: string;
}

interface GoogleAutocompleteResponse {
	suggestions?: Array<{
		placePrediction?: {
			placeId?: unknown;
			structuredFormat?: {
				mainText?: { text?: unknown };
				secondaryText?: { text?: unknown };
			};
		};
	}>;
}

interface GooglePlaceDetailsResponse {
	id?: unknown;
	displayName?: { text?: unknown };
	location?: {
		latitude?: unknown;
		longitude?: unknown;
	};
}

function normalizeAutocomplete(
	response: GoogleAutocompleteResponse,
): ProviderResult<PlaceSuggestion[], PlaceSuggestion> {
	if (!Array.isArray(response.suggestions)) {
		return {
			status: "incomplete_response",
			missingFields: ["suggestions"],
		};
	}
	const suggestions: PlaceSuggestion[] = [];
	for (const suggestion of response.suggestions) {
		const prediction = suggestion.placePrediction;
		if (
			typeof prediction?.placeId !== "string" ||
			typeof prediction.structuredFormat?.mainText?.text !== "string" ||
			typeof prediction.structuredFormat.secondaryText?.text !== "string"
		) {
			return {
				status: "incomplete_response",
				missingFields: ["suggestions.placePrediction"],
			};
		}
		suggestions.push({
			placeId: prediction.placeId,
			primaryText: prediction.structuredFormat.mainText.text,
			secondaryText: prediction.structuredFormat.secondaryText.text,
		});
	}
	if (suggestions.length === 0) {
		return { status: "zero_result" };
	}
	if (suggestions.length > 1) {
		return { status: "ambiguous", options: suggestions };
	}
	return { status: "success", value: suggestions };
}

function normalizeDetails(response: GooglePlaceDetailsResponse): ProviderResult<Place> {
	const missingFields: string[] = [];
	if (typeof response.id !== "string") {
		missingFields.push("id");
	}
	if (typeof response.displayName?.text !== "string") {
		missingFields.push("displayName.text");
	}
	if (typeof response.location?.latitude !== "number") {
		missingFields.push("location.latitude");
	}
	if (typeof response.location?.longitude !== "number") {
		missingFields.push("location.longitude");
	}
	if (missingFields.length > 0) {
		return { status: "incomplete_response", missingFields };
	}
	return {
		status: "success",
		value: {
			placeId: response.id as string,
			displayName: response.displayName?.text as string,
			coordinate: {
				latitude: response.location?.latitude as number,
				longitude: response.location?.longitude as number,
			},
		},
	};
}

export function createLivePlacesProvider(
	config: LivePlacesConfig,
	fetchImpl: ProviderFetch,
	supportedArea: SupportedArea = MILAN_MUNICIPALITY_VIEWPORT,
): PlacesProvider {
	const commonHeaders = {
		"Content-Type": "application/json",
		"X-Goog-Api-Key": config.googleMapsApiKey,
	};
	return {
		viewport: supportedArea,
		autocomplete: async (input) => {
			const result = await requestProviderJson<GoogleAutocompleteResponse>(
				fetchImpl,
				"https://places.googleapis.com/v1/places:autocomplete",
				{
					method: "POST",
					headers: {
						...commonHeaders,
						"X-Goog-FieldMask":
							"suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat",
					},
					body: JSON.stringify({
						input: input.query,
						languageCode: input.languageCode ?? "pl",
						regionCode: input.regionCode ?? "IT",
						sessionToken: input.sessionToken,
						locationRestriction: {
							rectangle: supportedArea.rectangle,
						},
					}),
				},
			);
			return result.status === "success" ? normalizeAutocomplete(result.value) : result;
		},
		details: async (input) => {
			const query = new URLSearchParams({
				languageCode: input.languageCode ?? "pl",
				regionCode: input.regionCode ?? "IT",
			});
			if (input.sessionToken) query.set("sessionToken", input.sessionToken);
			const result = await requestProviderJson<GooglePlaceDetailsResponse>(
				fetchImpl,
				`https://places.googleapis.com/v1/places/${encodeURIComponent(input.placeId)}?${query}`,
				{
					headers: {
						...commonHeaders,
						"X-Goog-FieldMask": "id,displayName,location",
					},
				},
			);
			return result.status === "success" ? normalizeDetails(result.value) : result;
		},
	};
}
