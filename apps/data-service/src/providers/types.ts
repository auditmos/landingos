export type ProviderMode = "fixture" | "live";

export interface FlightLookupInput {
	flightNumber: string;
	date: string;
}

export interface Airport {
	iata: string;
	name: string;
}

export interface ProviderFlight {
	id: string;
	stableFlightId?: string;
	carrier: string;
	flightNumber: string;
	operatingCarrierCode?: string;
	operatingFlightNumber?: string;
	date: string;
	origin: Airport;
	destination: Airport;
	scheduledArrival: string;
	timeZone: string;
}

export type FlightInstance = ProviderFlight;

interface ProviderSuccess<T> {
	status: "success";
	value: T;
}

interface ProviderAmbiguous<T> {
	status: "ambiguous";
	options: T[];
}

interface ProviderZeroResult {
	status: "zero_result";
}

interface ProviderTimeout {
	status: "timeout";
	retryable: true;
}

interface ProviderRateLimited {
	status: "rate_limited";
	retryable: true;
}

interface ProviderError {
	status: "provider_error";
	httpStatus: number;
	retryable: boolean;
}

interface ProviderIncompleteResponse {
	status: "incomplete_response";
	missingFields: string[];
}

interface ProviderMalformedResponse {
	status: "malformed_response";
}

export type ProviderResult<T, TOption = T> =
	| ProviderSuccess<T>
	| ProviderAmbiguous<TOption>
	| ProviderZeroResult
	| ProviderTimeout
	| ProviderRateLimited
	| ProviderError
	| ProviderIncompleteResponse
	| ProviderMalformedResponse;

export interface FlightProvider {
	lookup(input: FlightLookupInput): Promise<ProviderResult<ProviderFlight>>;
}

export interface PlaceAutocompleteInput {
	query: string;
	languageCode?: string;
}

export interface PlaceDetailsInput {
	placeId: string;
}

export interface PlaceSuggestion {
	placeId: string;
	displayText: string;
}

export interface Place extends PlaceSuggestion {
	coordinate: {
		latitude: number;
		longitude: number;
	};
}

export interface PlacesProvider {
	viewport: unknown;
	autocomplete(
		input: PlaceAutocompleteInput,
	): Promise<ProviderResult<PlaceSuggestion[], PlaceSuggestion>>;
	details(input: PlaceDetailsInput): Promise<ProviderResult<Place>>;
}

export interface TransitRouteInput {
	origin: {
		latitude: number;
		longitude: number;
	};
	destination: {
		latitude: number;
		longitude: number;
	};
	departureTime: string;
}

export type TransitMode = "bus" | "train" | "metro" | "tram" | "walk";

export interface TransitLeg {
	mode: TransitMode;
	from: string;
	to: string;
	durationMinutes: number;
}

export interface TransitRoute {
	id: string;
	durationMinutes: number;
	transfers: number;
	walkingMinutes: number;
	legs: TransitLeg[];
	fare: {
		currency: "EUR";
		amountMinor: number | null;
		completeness: "complete" | "partial" | "unknown";
	};
	source: {
		kind: ProviderMode;
		label: string;
	};
}

export interface TransitProvider {
	route(input: TransitRouteInput): Promise<ProviderResult<TransitRoute[], TransitRoute>>;
}

export interface TransferCatalogEntry {
	id: string;
	operator: string;
	service: string;
	sourceUrl: string;
	checkedOn: string;
	priceRange: {
		currency: "EUR";
		minorMin: number;
		minorMax: number;
	};
	purchaseUrl: string;
	provenance: "synthetic_recorded_for_testing" | "operator_verified";
}

export interface TransferCatalogProvider {
	list(): Promise<ProviderResult<TransferCatalogEntry[]>>;
}

export interface ProviderAdapters {
	mode: ProviderMode;
	flight: FlightProvider;
	places: PlacesProvider;
	transit: TransitProvider;
	transferCatalog: TransferCatalogProvider;
}
