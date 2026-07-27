export { countFlightInstances, getFlightInstance, upsertFlightInstance } from "./queries";
export type {
	FlightInstance,
	FlightInstanceWrite,
	FlightLookupRequest,
	FlightResolveResult,
	ManualFlightRequest,
} from "./schema";
export {
	FlightInstanceSchema,
	FlightLookupRequestSchema,
	FlightResolveResultSchema,
	ManualFlightRequestSchema,
	normalizeFlightNumber,
	splitFlightNumber,
} from "./schema";
export { flightInstances } from "./table";
