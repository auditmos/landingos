import type { Coordinate } from "./milan-viewport";

/**
 * Route origin for every BGY recommendation: the arrivals-side airport bus station,
 * where the Milan buses depart.
 *
 * The aerodrome reference point (45.6739, 9.7042) sits on the runway; Google Routes
 * snapped it to bus stops in Seriate on the far side of the airfield, producing
 * two-hour walk-first itineraries instead of the 57-minute airport bus. Measured on
 * 2026-08-22 (see `docs/evidence/s0-provider-readiness.md`).
 */
export const BGY_ROUTE_ORIGIN: Coordinate = { latitude: 45.6656872, longitude: 9.6978308 };

export const BGY_ROUTE_ORIGIN_PROVENANCE = {
	placeName: "Bergamo Airport Bus Station",
	placeType: "bus_station",
	source: "google_places_text_search",
	checkedOn: "2026-08-22",
} as const;

const AIRPORT_STOP_PATTERN = /\b(bgy|airport|aeroporto|orio)\b/i;

/** True when a transit stop name reads as the airport itself (not a stop in a nearby town). */
export function isAirportStopName(stopName: string): boolean {
	return AIRPORT_STOP_PATTERN.test(stopName);
}
