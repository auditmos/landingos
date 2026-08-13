import {
	type DestinationAutocompleteRequest,
	DestinationAutocompleteRequestSchema,
	type DestinationAutocompleteResult,
	type DestinationPrediction,
	type DestinationSelectionRequest,
	DestinationSelectionRequestSchema,
	type DestinationSelectionResult,
	type DestinationUnavailableReason,
} from "@repo/data-ops/destination";
import {
	containsCoordinate,
	contextDiagnostic,
	type DiagnosticContext,
	type Place,
	type PlaceSuggestion,
	type PlacesProvider,
	type ProviderResult,
} from "../providers";

function unavailableReason<T>(
	result: Exclude<ProviderResult<T>, { status: "success" } | { status: "ambiguous" }>,
): DestinationUnavailableReason {
	switch (result.status) {
		case "zero_result":
			return "not_found";
		case "timeout":
			return "timeout";
		case "rate_limited":
			return "rate_limited";
		case "provider_error":
			return "provider_error";
		case "incomplete_response":
		case "malformed_response":
			return "incomplete";
	}
}

function privatePrediction(prediction: PlaceSuggestion): DestinationPrediction {
	return {
		placeId: prediction.placeId,
		primaryText: prediction.primaryText,
		secondaryText: prediction.secondaryText,
	};
}

function autocompleteResult(
	result: ProviderResult<PlaceSuggestion[], PlaceSuggestion>,
	diagnostics: DiagnosticContext | undefined,
): DestinationAutocompleteResult {
	if (result.status === "success") {
		return {
			status: "suggestions",
			predictions: result.value.map(privatePrediction),
		};
	}
	if (result.status === "ambiguous") {
		return {
			status: "suggestions",
			predictions: result.options.map(privatePrediction),
		};
	}
	const diagnostic = contextDiagnostic(diagnostics, result);
	return {
		status: "autocomplete_unavailable",
		reason: unavailableReason(result),
		...(diagnostic ? { diagnostic } : {}),
	};
}

function selectionUnavailable(
	result: Exclude<ProviderResult<Place>, { status: "success" }>,
	diagnostics: DiagnosticContext | undefined,
): DestinationSelectionResult {
	const diagnostic = contextDiagnostic(diagnostics, result);
	return {
		status: "destination_unavailable",
		reason: result.status === "ambiguous" ? "incomplete" : unavailableReason(result),
		...(diagnostic ? { diagnostic } : {}),
	};
}

export interface DestinationService {
	autocomplete(input: DestinationAutocompleteRequest): Promise<DestinationAutocompleteResult>;
	select(input: DestinationSelectionRequest): Promise<DestinationSelectionResult>;
}

export function createDestinationService(
	provider: PlacesProvider,
	diagnostics?: DiagnosticContext,
): DestinationService {
	return {
		autocomplete: async (rawInput) => {
			const input = DestinationAutocompleteRequestSchema.parse(rawInput);
			const result = await provider.autocomplete({
				query: input.query,
				languageCode: "pl",
				regionCode: "IT",
				sessionToken: input.sessionToken,
			});
			return autocompleteResult(result, diagnostics);
		},
		select: async (rawInput) => {
			const input = DestinationSelectionRequestSchema.parse(rawInput);
			const result = await provider.details({
				placeId: input.placeId,
				languageCode: "pl",
				regionCode: "IT",
				sessionToken: input.sessionToken,
			});
			if (result.status !== "success") {
				return selectionUnavailable(result, diagnostics);
			}
			if (!containsCoordinate(result.value.coordinate, provider.viewport)) {
				return {
					status: "destination_not_supported",
					supportedAreaVersion: provider.viewport.version,
				};
			}
			return {
				status: "destination_selected",
				destination: {
					placeId: result.value.placeId,
					displayName: result.value.displayName,
					coordinates: result.value.coordinate,
					supportedAreaVersion: provider.viewport.version,
				},
			};
		},
	};
}
