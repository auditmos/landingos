import { createLiveFlightProvider } from "./live-flight";
import { createAerodataboxFlightProvider } from "./live-flight-aerodatabox";
import type { ProviderFetch } from "./live-http";
import { createLivePlacesProvider } from "./live-places";
import { createLiveTransitProvider } from "./live-transit";
import type { ProviderAdapters } from "./types";

export type LiveProviderCredentials =
	| {
			flightProvider?: "aviationstack";
			aviationstackAccessKey: string;
			googleMapsApiKey: string;
	  }
	| {
			flightProvider: "aerodatabox";
			aerodataboxRapidApiKey: string;
			googleMapsApiKey: string;
	  };

export function createLiveProviderAdapters(
	credentials: LiveProviderCredentials,
	fetchImpl: ProviderFetch,
	runtime: { today?: () => string } = {},
): ProviderAdapters {
	const flight =
		credentials.flightProvider === "aerodatabox"
			? createAerodataboxFlightProvider(credentials, fetchImpl)
			: createLiveFlightProvider(credentials, fetchImpl, runtime);
	return {
		mode: "live",
		flight,
		places: createLivePlacesProvider(credentials, fetchImpl),
		transit: createLiveTransitProvider(credentials, fetchImpl),
		transferCatalog: {
			list: async () => ({ status: "zero_result" }),
		},
	};
}
