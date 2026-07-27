import {
	type FlightInstanceWrite,
	type FlightLookupRequest,
	type FlightResolveResult,
	type ManualFlightRequest,
	upsertFlightInstance,
} from "@repo/data-ops/flight";
import type { FlightProvider } from "../providers";
import { completeManualFlight, resolveFlight } from "./resolver";

type FlightDatabase = Parameters<typeof upsertFlightInstance>[0];

export interface FlightService {
	resolve(input: FlightLookupRequest): Promise<FlightResolveResult>;
	completeManual(input: ManualFlightRequest): Promise<FlightResolveResult>;
}

export function createFlightService(provider: FlightProvider, db: FlightDatabase): FlightService {
	const repository = {
		save: (input: FlightInstanceWrite) => upsertFlightInstance(db, input),
	};
	return {
		resolve: (input) => resolveFlight(input, { provider, repository }),
		completeManual: (input) => completeManualFlight(input, { repository }),
	};
}
