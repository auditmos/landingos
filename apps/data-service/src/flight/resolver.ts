import {
	type FlightInstance,
	type FlightInstanceWrite,
	type FlightLookupRequest,
	FlightLookupRequestSchema,
	type ManualFlightRequest,
	ManualFlightRequestSchema,
	splitFlightNumber,
} from "@repo/data-ops/flight";
import {
	contextDiagnostic,
	type DiagnosticContext,
	type FlightProvider,
	type ProviderDiagnostic,
	type ProviderFlight,
	type ProviderResult,
} from "../providers";

export interface FlightInstanceRepository {
	save(input: FlightInstanceWrite): Promise<FlightInstance>;
}

interface ResolverDependencies {
	provider: FlightProvider;
	repository: FlightInstanceRepository;
	diagnostics?: DiagnosticContext;
}

interface ManualDependencies {
	repository: FlightInstanceRepository;
}

type ManualReason = "not_found" | "timeout" | "rate_limited" | "provider_error" | "incomplete";

function manualRequired(
	input: FlightLookupRequest,
	reason: ManualReason,
	diagnostic?: ProviderDiagnostic,
) {
	return {
		status: "manual_required" as const,
		reason,
		flightNumber: input.flightNumber,
		departureLocalDate: input.departureLocalDate,
		...(diagnostic ? { diagnostic } : {}),
	};
}

function providerFailureReason(
	result: Exclude<ProviderResult<ProviderFlight>, { status: "success" }>,
): ManualReason {
	switch (result.status) {
		case "zero_result":
			return "not_found";
		case "timeout":
			return "timeout";
		case "rate_limited":
			return "rate_limited";
		case "provider_error":
			return "provider_error";
		case "ambiguous":
		case "incomplete_response":
		case "malformed_response":
			return "incomplete";
	}
}

async function deterministicOpaqueId(canonicalKey: string): Promise<string> {
	const digest = new Uint8Array(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalKey)),
	);
	const bytes = digest.slice(0, 16);
	bytes[6] = ((bytes[6] as number) & 0x0f) | 0x50;
	bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalProviderKey(
	flight: ProviderFlight,
	input: FlightLookupRequest,
	scheduledArrivalUtc: string,
): string | null {
	const stableFlightId = flight.stableFlightId?.trim();
	if (stableFlightId) {
		return `provider:${stableFlightId}:${input.departureLocalDate}`;
	}
	const operatingCarrierCode = flight.operatingCarrierCode?.trim().toUpperCase();
	const operatingFlightNumber = flight.operatingFlightNumber?.trim();
	if (!operatingCarrierCode || !operatingFlightNumber) {
		return null;
	}
	return [
		"operating",
		operatingCarrierCode,
		operatingFlightNumber,
		input.departureLocalDate,
		"BGY",
		scheduledArrivalUtc,
	].join(":");
}

async function normalizeProviderFlight(
	flight: ProviderFlight,
	input: FlightLookupRequest,
): Promise<FlightInstanceWrite | null> {
	const destinationIata = flight.destination.iata.trim().toUpperCase();
	const originIata = flight.origin.iata.trim().toUpperCase();
	if (
		destinationIata !== "BGY" ||
		!/^[A-Z]{3}$/.test(originIata) ||
		flight.date !== input.departureLocalDate ||
		flight.timeZone !== "Europe/Rome"
	) {
		return null;
	}
	const arrival = new Date(flight.scheduledArrival);
	if (Number.isNaN(arrival.valueOf())) {
		return null;
	}
	const scheduledArrivalUtc = arrival.toISOString();
	const canonicalKey = canonicalProviderKey(flight, input, scheduledArrivalUtc);
	if (!canonicalKey) {
		return null;
	}
	const marketing = splitFlightNumber(input.flightNumber);
	const operatingCarrierCode = flight.operatingCarrierCode?.trim().toUpperCase() ?? null;
	const operatingFlightNumber = flight.operatingFlightNumber?.trim() ?? null;
	return {
		id: await deterministicOpaqueId(canonicalKey),
		canonicalKey,
		marketingCarrierCode: marketing.carrierCode,
		marketingCarrierName: flight.carrier.trim() || marketing.carrierCode,
		marketingFlightNumber: marketing.number,
		operatingCarrierCode,
		operatingFlightNumber,
		departureLocalDate: input.departureLocalDate,
		originIata,
		destinationIata: "BGY",
		scheduledArrivalUtc,
		displayTimezone: "Europe/Rome",
		source: "provider",
	};
}

export async function resolveFlight(
	rawInput: FlightLookupRequest,
	dependencies: ResolverDependencies,
) {
	const input = FlightLookupRequestSchema.parse(rawInput);
	let result: ProviderResult<ProviderFlight>;
	try {
		result = await dependencies.provider.lookup({
			flightNumber: input.flightNumber,
			date: input.departureLocalDate,
		});
	} catch (error) {
		const thrownAsTimeout =
			error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
		const thrown = thrownAsTimeout
			? ({ status: "timeout", retryable: true } as const)
			: ({ status: "provider_error", httpStatus: 0, retryable: true } as const);
		return manualRequired(
			input,
			thrownAsTimeout ? "timeout" : "provider_error",
			contextDiagnostic(dependencies.diagnostics, thrown),
		);
	}
	if (result.status !== "success") {
		return manualRequired(
			input,
			providerFailureReason(result),
			contextDiagnostic(dependencies.diagnostics, result),
		);
	}
	const normalized = await normalizeProviderFlight(result.value, input);
	if (!normalized) {
		// A payload that survives transport but not normalization is an incomplete
		// provider response, not a traveler input error.
		return manualRequired(
			input,
			"incomplete",
			contextDiagnostic(dependencies.diagnostics, {
				status: "incomplete_response",
				missingFields: ["flightInstance"],
			}),
		);
	}
	const persisted = await dependencies.repository.save(normalized);
	return {
		status: "recognized" as const,
		flight: {
			...persisted,
			marketingCarrierCode: normalized.marketingCarrierCode,
			marketingCarrierName: normalized.marketingCarrierName,
			marketingFlightNumber: normalized.marketingFlightNumber,
		},
	};
}

export async function completeManualFlight(
	rawInput: ManualFlightRequest,
	dependencies: ManualDependencies,
) {
	const input = ManualFlightRequestSchema.parse(rawInput);
	const marketing = splitFlightNumber(input.flightNumber);
	const scheduledArrivalUtc = new Date(input.scheduledArrivalUtc).toISOString();
	const canonicalKey = [
		"manual",
		input.flightNumber.toLowerCase(),
		input.departureLocalDate,
		"bgy",
	].join(":");
	const flight = await dependencies.repository.save({
		id: await deterministicOpaqueId(canonicalKey),
		canonicalKey,
		marketingCarrierCode: marketing.carrierCode,
		marketingCarrierName: marketing.carrierCode,
		marketingFlightNumber: marketing.number,
		operatingCarrierCode: null,
		operatingFlightNumber: null,
		departureLocalDate: input.departureLocalDate,
		originIata: "ZZZ",
		destinationIata: "BGY",
		scheduledArrivalUtc,
		displayTimezone: "Europe/Rome",
		source: "manual",
	});
	const manualArrivalConflict =
		flight.scheduledArrivalUtc === scheduledArrivalUtc
			? undefined
			: {
					requestedScheduledArrivalUtc: scheduledArrivalUtc,
					sharedScheduledArrivalUtc: flight.scheduledArrivalUtc,
				};
	return {
		status: "recognized" as const,
		flight,
		...(manualArrivalConflict ? { manualArrivalConflict } : {}),
	};
}
