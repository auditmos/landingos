import { type ProviderFetch, requestProviderJson } from "./live-http";
import type {
	ProviderResult,
	TransitLeg,
	TransitMode,
	TransitProvider,
	TransitRoute,
	TransitRouteInput,
} from "./types";

interface LiveTransitConfig {
	googleMapsApiKey: string;
}

interface GoogleRouteStep {
	travelMode?: unknown;
	staticDuration?: unknown;
	distanceMeters?: unknown;
	transitDetails?: {
		stopDetails?: {
			departureStop?: { name?: unknown };
			arrivalStop?: { name?: unknown };
		};
		transitLine?: {
			vehicle?: { type?: unknown };
		};
	};
}

interface GoogleRoute {
	duration?: unknown;
	legs?: Array<{ steps?: GoogleRouteStep[] }>;
	travelAdvisory?: {
		transitFare?: {
			currencyCode?: unknown;
			units?: unknown;
			nanos?: unknown;
		};
	};
}

interface GoogleRoutesResponse {
	routes?: GoogleRoute[];
}

// Google serializes protobuf with proto3 JSON rules: fields at their default value
// (0, "", false) are omitted. A 0 m walk step or a whole-euro fare therefore arrives
// without `distanceMeters` / `nanos`; absence is a value, not a missing field.

function durationSeconds(value: unknown): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string") {
		return undefined;
	}
	const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
	return match?.[1] === undefined ? undefined : Number(match[1]);
}

function minutes(seconds: number): number {
	return Math.round(seconds / 60);
}

function transitMode(vehicleType: unknown): TransitMode {
	switch (vehicleType) {
		case "SUBWAY":
		case "METRO_RAIL":
			return "metro";
		case "RAIL":
		case "HEAVY_RAIL":
			return "train";
		case "TRAM":
			return "tram";
		default:
			return "bus";
	}
}

interface NormalizedStep {
	mode: TransitMode | "walk";
	from: string;
	to: string;
	seconds: number;
	walkingMeters: number;
}

function normalizeStep(step: GoogleRouteStep, path: string): NormalizedStep | string {
	const seconds = durationSeconds(step.staticDuration);
	if (seconds === undefined) {
		return `${path}.staticDuration`;
	}
	if (step.travelMode === "WALK") {
		const distance = step.distanceMeters === undefined ? 0 : step.distanceMeters;
		if (typeof distance !== "number") {
			return `${path}.distanceMeters`;
		}
		return {
			mode: "walk",
			from: "Początek odcinka pieszego",
			to: "Koniec odcinka pieszego",
			seconds,
			walkingMeters: Math.round(distance),
		};
	}
	if (step.travelMode !== "TRANSIT") {
		return `${path}.travelMode`;
	}
	const from = step.transitDetails?.stopDetails?.departureStop?.name;
	const to = step.transitDetails?.stopDetails?.arrivalStop?.name;
	if (typeof from !== "string" || typeof to !== "string") {
		return `${path}.transitDetails.stopDetails`;
	}
	return {
		mode: transitMode(step.transitDetails?.transitLine?.vehicle?.type),
		from,
		to,
		seconds,
		walkingMeters: 0,
	};
}

/** Google emits one WALK step per navigation instruction; travelers need one walk leg. */
function mergeWalkSteps(steps: NormalizedStep[]): NormalizedStep[] {
	const merged: NormalizedStep[] = [];
	for (const step of steps) {
		const previous = merged.at(-1);
		if (step.mode === "walk" && previous?.mode === "walk") {
			previous.seconds += step.seconds;
			previous.walkingMeters += step.walkingMeters;
			continue;
		}
		merged.push({ ...step });
	}
	return merged;
}

function toLeg(step: NormalizedStep): TransitLeg {
	return {
		mode: step.mode,
		from: step.from,
		to: step.to,
		durationMinutes: minutes(step.seconds),
		walkingMeters: step.walkingMeters,
	};
}

function stableRouteId(input: TransitRouteInput, index: number): string {
	const value = [
		input.origin.latitude,
		input.origin.longitude,
		input.destination.latitude,
		input.destination.longitude,
		input.departureTime,
		index,
	].join("|");
	let hash = 0x811c9dc5;
	for (let characterIndex = 0; characterIndex < value.length; characterIndex += 1) {
		hash ^= value.charCodeAt(characterIndex);
		hash = Math.imul(hash, 0x01000193);
	}
	return `google:route:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeFare(route: GoogleRoute): TransitRoute["fare"] {
	const fare = route.travelAdvisory?.transitFare;
	const units = fare?.units === undefined ? "0" : fare.units;
	const nanos = fare?.nanos === undefined ? 0 : fare.nanos;
	if (
		fare?.currencyCode !== "EUR" ||
		typeof units !== "string" ||
		!/^\d+$/.test(units) ||
		typeof nanos !== "number"
	) {
		return {
			currency: "EUR",
			amountMinor: null,
			completeness: "unknown",
		};
	}
	return {
		currency: "EUR",
		amountMinor: Number(units) * 100 + Math.round(nanos / 10_000_000),
		completeness: "complete",
	};
}

function normalizeRoute(
	raw: GoogleRoute,
	input: TransitRouteInput,
	index: number,
): TransitRoute | string {
	const path = `routes[${index}]`;
	const totalSeconds = durationSeconds(raw.duration);
	if (totalSeconds === undefined) {
		return `${path}.duration`;
	}
	const steps = raw.legs?.flatMap((leg) => leg.steps ?? []);
	if (steps === undefined || steps.length === 0) {
		return `${path}.legs.steps`;
	}
	const normalizedSteps: NormalizedStep[] = [];
	for (const [stepIndex, step] of steps.entries()) {
		const normalized = normalizeStep(step, `${path}.legs.steps[${stepIndex}]`);
		if (typeof normalized === "string") {
			return normalized;
		}
		normalizedSteps.push(normalized);
	}
	const legs = mergeWalkSteps(normalizedSteps).map(toLeg);
	const transitLegCount = legs.filter((leg) => leg.mode !== "walk").length;
	const walkLegs = legs.filter((leg) => leg.mode === "walk");
	return {
		id: stableRouteId(input, index),
		departureTime: input.departureTime,
		arrivalTime: new Date(
			new Date(input.departureTime).getTime() + totalSeconds * 1_000,
		).toISOString(),
		durationMinutes: minutes(totalSeconds),
		transfers: Math.max(0, transitLegCount - 1),
		walkingMinutes: walkLegs.reduce((total, leg) => total + leg.durationMinutes, 0),
		walkingMeters: walkLegs.reduce((total, leg) => total + leg.walkingMeters, 0),
		legs,
		fare: normalizeFare(raw),
		source: {
			kind: "live",
			label: "google_routes_transit",
		},
	};
}

/**
 * One malformed alternative must not discard the valid routes Google also returned.
 * Only an answer with no usable route at all is reported as incomplete.
 */
function normalizeResponse(
	response: GoogleRoutesResponse,
	input: TransitRouteInput,
): ProviderResult<TransitRoute[], TransitRoute> {
	if (!Array.isArray(response.routes)) {
		return {
			status: "incomplete_response",
			missingFields: ["routes"],
		};
	}
	if (response.routes.length === 0) {
		return { status: "zero_result" };
	}
	const routes: TransitRoute[] = [];
	const missingFields: string[] = [];
	for (const [index, raw] of response.routes.entries()) {
		const normalized = normalizeRoute(raw, input, index);
		if (typeof normalized === "string") {
			missingFields.push(normalized);
			continue;
		}
		routes.push(normalized);
	}
	if (routes.length === 0) {
		return { status: "incomplete_response", missingFields };
	}
	return { status: "success", value: routes };
}

export function createLiveTransitProvider(
	config: LiveTransitConfig,
	fetchImpl: ProviderFetch,
): TransitProvider {
	return {
		route: async (input) => {
			const result = await requestProviderJson<GoogleRoutesResponse>(
				fetchImpl,
				"https://routes.googleapis.com/directions/v2:computeRoutes",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Goog-Api-Key": config.googleMapsApiKey,
						"X-Goog-FieldMask":
							"routes.duration,routes.legs.steps,routes.legs.steps.distanceMeters,routes.travelAdvisory.transitFare",
					},
					body: JSON.stringify({
						origin: {
							location: { latLng: input.origin },
						},
						destination: {
							location: { latLng: input.destination },
						},
						travelMode: "TRANSIT",
						departureTime: input.departureTime,
						computeAlternativeRoutes: true,
					}),
				},
			);
			return result.status === "success" ? normalizeResponse(result.value, input) : result;
		},
	};
}
