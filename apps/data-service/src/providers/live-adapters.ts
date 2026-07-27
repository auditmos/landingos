import { createLiveFlightProvider } from "./live-flight";
import type { ProviderFetch } from "./live-http";
import { createLivePlacesProvider } from "./live-places";
import { createLiveTransitProvider } from "./live-transit";
import type { ProviderAdapters } from "./types";

export interface LiveProviderCredentials {
	aviationstackAccessKey: string;
	googleMapsApiKey: string;
}

export function createLiveProviderAdapters(
	credentials: LiveProviderCredentials,
	fetchImpl: ProviderFetch,
): ProviderAdapters {
	return {
		mode: "live",
		flight: createLiveFlightProvider(credentials, fetchImpl),
		places: createLivePlacesProvider(credentials, fetchImpl),
		transit: createLiveTransitProvider(credentials, fetchImpl),
		transferCatalog: {
			list: async () => ({ status: "zero_result" }),
		},
	};
}
