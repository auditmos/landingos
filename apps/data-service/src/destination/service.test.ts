import type {
	Place,
	PlaceSuggestion,
	PlacesProvider,
	ProviderResult,
	SupportedArea,
} from "../providers";
import { MILAN_MUNICIPALITY_VIEWPORT } from "../providers";
import { createDestinationService } from "./service";

function placesProvider(options: {
	autocomplete?: ProviderResult<PlaceSuggestion[], PlaceSuggestion>;
	details?: ProviderResult<Place>;
	area?: SupportedArea;
}) {
	const autocompleteResult: ProviderResult<PlaceSuggestion[], PlaceSuggestion> =
		options.autocomplete ?? { status: "zero_result" };
	const detailsResult: ProviderResult<Place> = options.details ?? { status: "zero_result" };
	const provider: PlacesProvider = {
		viewport: options.area ?? MILAN_MUNICIPALITY_VIEWPORT,
		autocomplete: vi.fn(async () => autocompleteResult),
		details: vi.fn(async () => detailsResult),
	};
	return provider;
}

const sessionToken = "planner-session-123456";

describe("destination service", () => {
	it.each([
		["adres", "fixture:place:via-torino", "Via Torino 42", "20123 Milano MI, Włochy"],
		["hotel", "fixture:place:hotel-berna", "Hotel Berna", "Via Napo Torriani 18, Milano"],
		["miejsce", "fixture:place:duomo", "Duomo di Milano", "Piazza del Duomo, Milano"],
	])("returns a stable, explicit %s prediction", async (_kind, placeId, primaryText, secondaryText) => {
		const provider = placesProvider({
			autocomplete: {
				status: "success",
				value: [{ placeId, primaryText, secondaryText }],
			},
		});
		const result = await createDestinationService(provider).autocomplete({
			query: primaryText,
			sessionToken,
		});
		expect(result).toEqual({
			status: "suggestions",
			predictions: [{ placeId, primaryText, secondaryText }],
		});
		expect(provider.details).not.toHaveBeenCalled();
	});

	it("uses one session token for autocomplete and exactly one explicit details call", async () => {
		const provider = placesProvider({
			autocomplete: {
				status: "success",
				value: [
					{
						placeId: "fixture:place:duomo",
						primaryText: "Duomo di Milano",
						secondaryText: "Piazza del Duomo, Milano",
					},
				],
			},
			details: {
				status: "success",
				value: {
					placeId: "fixture:place:duomo",
					displayName: "Duomo di Milano",
					coordinate: { latitude: 45.464098, longitude: 9.191926 },
				},
			},
		});
		const service = createDestinationService(provider);
		await service.autocomplete({ query: "Duomo", sessionToken });
		const result = await service.select({
			placeId: "fixture:place:duomo",
			sessionToken,
		});
		expect(provider.autocomplete).toHaveBeenCalledWith({
			query: "Duomo",
			languageCode: "pl",
			regionCode: "IT",
			sessionToken,
		});
		expect(provider.details).toHaveBeenCalledTimes(1);
		expect(provider.details).toHaveBeenCalledWith({
			placeId: "fixture:place:duomo",
			languageCode: "pl",
			regionCode: "IT",
			sessionToken,
		});
		expect(result).toEqual({
			status: "destination_selected",
			destination: {
				placeId: "fixture:place:duomo",
				displayName: "Duomo di Milano",
				coordinates: { latitude: 45.464098, longitude: 9.191926 },
				supportedAreaVersion: "milan-municipality-v1",
			},
		});
	});

	it.each([
		["low", MILAN_MUNICIPALITY_VIEWPORT.rectangle.low],
		["high", MILAN_MUNICIPALITY_VIEWPORT.rectangle.high],
	])("accepts the inclusive %s boundary", async (_edge, coordinate) => {
		const provider = placesProvider({
			details: {
				status: "success",
				value: {
					placeId: `fixture:boundary:${_edge}`,
					displayName: `Granica ${_edge}`,
					coordinate,
				},
			},
		});
		const result = await createDestinationService(provider).select({
			placeId: `fixture:boundary:${_edge}`,
			sessionToken,
		});
		expect(result.status).toBe("destination_selected");
	});

	it("returns destination_not_supported outside the configured area without routing", async () => {
		const route = vi.fn();
		const provider = placesProvider({
			details: {
				status: "success",
				value: {
					placeId: "fixture:place:bgy",
					displayName: "Lotnisko Mediolan-Bergamo",
					coordinate: { latitude: 45.6739, longitude: 9.7042 },
				},
			},
		});
		const result = await createDestinationService(provider).select({
			placeId: "fixture:place:bgy",
			sessionToken,
		});
		expect(result).toEqual({
			status: "destination_not_supported",
			supportedAreaVersion: "milan-municipality-v1",
		});
		expect(route).not.toHaveBeenCalled();
	});

	it("changes boundary behavior by replacing only the supported-area configuration", async () => {
		const configuredArea: SupportedArea = {
			version: "milan-test-v2",
			rectangle: {
				low: { latitude: 45.48, longitude: 9.2 },
				high: { latitude: 45.5, longitude: 9.22 },
			},
		};
		const provider = placesProvider({
			area: configuredArea,
			details: {
				status: "success",
				value: {
					placeId: "fixture:place:duomo",
					displayName: "Duomo di Milano",
					coordinate: { latitude: 45.464098, longitude: 9.191926 },
				},
			},
		});
		await expect(
			createDestinationService(provider).select({
				placeId: "fixture:place:duomo",
				sessionToken,
			}),
		).resolves.toEqual({
			status: "destination_not_supported",
			supportedAreaVersion: "milan-test-v2",
		});
	});

	it.each([
		[{ status: "zero_result" }, "not_found"],
		[{ status: "timeout", retryable: true }, "timeout"],
		[{ status: "rate_limited", retryable: true }, "rate_limited"],
		[{ status: "provider_error", httpStatus: 500, retryable: true }, "provider_error"],
		[{ status: "malformed_response" }, "incomplete"],
	] as const)("maps a provider fault to %s", async (providerResult, reason) => {
		const provider = placesProvider({ autocomplete: providerResult });
		await expect(
			createDestinationService(provider).autocomplete({ query: "Duomo", sessionToken }),
		).resolves.toEqual({
			status: "autocomplete_unavailable",
			reason,
		});
	});
});
