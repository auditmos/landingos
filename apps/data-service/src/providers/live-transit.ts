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

function durationMinutes(value: unknown): number | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
	return match?.[1] === undefined ? undefined : Math.round(Number(match[1]) / 60);
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

function normalizeLeg(step: GoogleRouteStep, index: number): TransitLeg | string[] {
	const minutes = durationMinutes(step.staticDuration);
	if (minutes === undefined) {
		return [`legs.steps[${index}].staticDuration`];
	}
	if (step.travelMode === "WALK") {
		return {
			mode: "walk",
			from: "Początek odcinka pieszego",
			to: "Koniec odcinka pieszego",
			durationMinutes: minutes,
		};
	}
	if (step.travelMode !== "TRANSIT") {
		return [`legs.steps[${index}].travelMode`];
	}
	const from = step.transitDetails?.stopDetails?.departureStop?.name;
	const to = step.transitDetails?.stopDetails?.arrivalStop?.name;
	if (typeof from !== "string" || typeof to !== "string") {
		return [`legs.steps[${index}].transitDetails.stopDetails`];
	}
	return {
		mode: transitMode(step.transitDetails?.transitLine?.vehicle?.type),
		from,
		to,
		durationMinutes: minutes,
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
	if (
		fare?.currencyCode !== "EUR" ||
		typeof fare.units !== "string" ||
		typeof fare.nanos !== "number"
	) {
		return {
			currency: "EUR",
			amountMinor: null,
			completeness: "unknown",
		};
	}
	return {
		currency: "EUR",
		amountMinor: Number(fare.units) * 100 + Math.round(fare.nanos / 10_000_000),
		completeness: "complete",
	};
}

function normalizeRoute(
	raw: GoogleRoute,
	input: TransitRouteInput,
	index: number,
): TransitRoute | string[] {
	const totalDuration = durationMinutes(raw.duration);
	if (totalDuration === undefined) {
		return [`routes[${index}].duration`];
	}
	const steps = raw.legs?.flatMap((leg) => leg.steps ?? []);
	if (steps === undefined || steps.length === 0) {
		return [`routes[${index}].legs.steps`];
	}
	const legs: TransitLeg[] = [];
	for (const [stepIndex, step] of steps.entries()) {
		const normalized = normalizeLeg(step, stepIndex);
		if (Array.isArray(normalized)) {
			return normalized;
		}
		legs.push(normalized);
	}
	const transitLegCount = legs.filter((leg) => leg.mode !== "walk").length;
	return {
		id: stableRouteId(input, index),
		durationMinutes: totalDuration,
		transfers: Math.max(0, transitLegCount - 1),
		walkingMinutes: legs
			.filter((leg) => leg.mode === "walk")
			.reduce((total, leg) => total + leg.durationMinutes, 0),
		legs,
		fare: normalizeFare(raw),
		source: {
			kind: "live",
			label: "google_routes_transit",
		},
	};
}

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
	for (const [index, raw] of response.routes.entries()) {
		const normalized = normalizeRoute(raw, input, index);
		if (Array.isArray(normalized)) {
			return {
				status: "incomplete_response",
				missingFields: normalized,
			};
		}
		routes.push(normalized);
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
							"routes.duration,routes.legs.steps,routes.travelAdvisory.transitFare",
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
