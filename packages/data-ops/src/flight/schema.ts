import { z } from "zod";

const FLIGHT_NUMBER_PATTERN = /^([A-Z0-9]{2})(\d{1,4})$/;
const IATA_INPUT_PATTERN = /^([A-Z0-9]{2})(?:[ -]?)(\d{1,4})$/;
const LEGACY_INPUT_PATTERN = /^([A-Z0-9]{2})\s+\1(\d{1,4})$/;
const ICAO_INPUT_PATTERN = /^([A-Z]{3})(?:[ -]?)(\d{1,4})$/;
const SUPPORTED_ICAO_TO_IATA = {
	LOT: "LO",
	RYR: "FR",
	WZZ: "W6",
} as const;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export type FlightDesignatorParseResult =
	| {
			status: "recognized";
			canonical: string;
			display: string;
			carrierCode: string;
			flightNumber: string;
			convention: "iata" | "legacy" | "icao";
	  }
	| {
			status: "invalid";
			reason: "empty" | "incomplete" | "malformed" | "unsupported_icao";
			message: string;
	  };

function recognizedDesignator(
	carrierCode: string,
	flightNumber: string,
	convention: "iata" | "legacy" | "icao",
): FlightDesignatorParseResult {
	return {
		status: "recognized",
		canonical: `${carrierCode}${flightNumber}`,
		display: `${carrierCode} ${flightNumber}`,
		carrierCode,
		flightNumber,
		convention,
	};
}

export function parseFlightDesignator(value: string): FlightDesignatorParseResult {
	const input = value.trim().toUpperCase();
	const legacy = LEGACY_INPUT_PATTERN.exec(input);
	if (legacy) {
		return recognizedDesignator(legacy[1] as string, legacy[2] as string, "legacy");
	}
	const iata = IATA_INPUT_PATTERN.exec(input);
	if (iata) {
		return recognizedDesignator(iata[1] as string, iata[2] as string, "iata");
	}
	const icao = ICAO_INPUT_PATTERN.exec(input);
	if (icao) {
		const carrierCode = SUPPORTED_ICAO_TO_IATA[icao[1] as keyof typeof SUPPORTED_ICAO_TO_IATA];
		if (carrierCode) {
			return recognizedDesignator(carrierCode, icao[2] as string, "icao");
		}
	}
	const isEmpty = input.length === 0;
	const isIncomplete = /^[A-Z0-9]{1,2}[ -]?$/.test(input);
	const isUnsupportedIcao = Boolean(icao);
	const reason = isEmpty
		? "empty"
		: isIncomplete
			? "incomplete"
			: isUnsupportedIcao
				? "unsupported_icao"
				: "malformed";
	const messages = {
		empty: "Podaj numer lotu.",
		incomplete: "Dokończ numer lotu: po kodzie przewoźnika wpisz od 1 do 4 cyfr.",
		unsupported_icao:
			"To wygląda jak trzy-literowy kod operacyjny. Podaj numer marketingowy z biletu lub karty pokładowej, np. W6 1431.",
		malformed: "Podaj jeden numer lotu z biletu, np. W6 1431 lub FR1234.",
	} as const;
	return {
		status: "invalid",
		reason,
		message: messages[reason],
	};
}

export function normalizeFlightNumber(value: string): string {
	const result = parseFlightDesignator(value);
	return result.status === "recognized" ? result.canonical : value.trim().toUpperCase();
}

interface FlightDesignatorParts {
	marketingCarrierCode: string;
	marketingCarrierName: string;
	marketingFlightNumber: string;
}

export function canonicalFlightDesignator(flight: FlightDesignatorParts): string {
	return `${flight.marketingCarrierCode}${flight.marketingFlightNumber}`;
}

export function formatFlightDesignator(value: string): string {
	const parsed = parseFlightDesignator(value);
	return parsed.status === "recognized" ? parsed.display : value.trim().toUpperCase();
}

export function formatFlightLabel(flight: FlightDesignatorParts): string {
	const designator = formatFlightDesignator(canonicalFlightDesignator(flight));
	const carrierName = flight.marketingCarrierName.trim();
	return carrierName && carrierName.toUpperCase() !== flight.marketingCarrierCode.toUpperCase()
		? `${carrierName} ${designator}`
		: designator;
}

export function splitFlightNumber(flightNumber: string): {
	carrierCode: string;
	number: string;
} {
	const match = FLIGHT_NUMBER_PATTERN.exec(normalizeFlightNumber(flightNumber));
	if (!match) {
		throw new Error("Invalid normalized flight number");
	}
	return { carrierCode: match[1] as string, number: match[2] as string };
}

function isIsoDate(value: string): boolean {
	if (!ISO_DATE_PATTERN.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(year as number, (month as number) - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
	);
}

const FlightNumberSchema = z.string().transform((value, context) => {
	const parsed = parseFlightDesignator(value);
	if (parsed.status === "recognized") return parsed.canonical;
	context.addIssue({ code: "custom", message: parsed.message });
	return z.NEVER;
});

const DepartureLocalDateSchema = z.string().superRefine((value, context) => {
	if (value.length === 0) {
		context.addIssue({ code: "custom", message: "Podaj datę wylotu." });
		return;
	}
	if (!isIsoDate(value)) {
		context.addIssue({ code: "custom", message: "Podaj prawidłową datę wylotu." });
	}
});

const ScheduledArrivalUtcSchema = z.string().superRefine((value, context) => {
	if (!UTC_INSTANT_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
		context.addIssue({
			code: "custom",
			message: "Podaj prawidłową planowaną godzinę przylotu w UTC.",
		});
	}
});

export const FlightLookupRequestSchema = z.strictObject({
	flightNumber: FlightNumberSchema,
	departureLocalDate: DepartureLocalDateSchema,
});

export const ManualFlightRequestSchema = FlightLookupRequestSchema.extend({
	destinationIata: z.literal("BGY", {
		error: "W tej wersji obsługiwane jest wyłącznie lotnisko BGY.",
	}),
	scheduledArrivalUtc: ScheduledArrivalUtcSchema,
});

export const FlightInstanceSchema = z.strictObject({
	id: z.string().min(1),
	marketingCarrierCode: z.string().min(2).max(2),
	marketingCarrierName: z.string().min(1),
	marketingFlightNumber: z.string().regex(/^\d{1,4}$/),
	operatingCarrierCode: z.string().min(2).max(2).nullable(),
	operatingFlightNumber: z
		.string()
		.regex(/^\d{1,4}$/)
		.nullable(),
	departureLocalDate: DepartureLocalDateSchema,
	originIata: z.string().length(3),
	destinationIata: z.literal("BGY"),
	scheduledArrivalUtc: ScheduledArrivalUtcSchema,
	displayTimezone: z.literal("Europe/Rome"),
	source: z.enum(["provider", "manual"]),
});

export const ManualArrivalConflictSchema = z.strictObject({
	requestedScheduledArrivalUtc: ScheduledArrivalUtcSchema,
	sharedScheduledArrivalUtc: ScheduledArrivalUtcSchema,
});

export const FlightResolveResultSchema = z.discriminatedUnion("status", [
	z.strictObject({
		status: z.literal("recognized"),
		flight: FlightInstanceSchema,
		manualArrivalConflict: ManualArrivalConflictSchema.optional(),
	}),
	z.strictObject({
		status: z.literal("manual_required"),
		reason: z.enum(["not_found", "timeout", "rate_limited", "provider_error", "incomplete"]),
		flightNumber: FlightNumberSchema,
		departureLocalDate: DepartureLocalDateSchema,
	}),
]);

export type FlightLookupRequest = z.infer<typeof FlightLookupRequestSchema>;
export type ManualFlightRequest = z.infer<typeof ManualFlightRequestSchema>;
export type FlightInstance = z.infer<typeof FlightInstanceSchema>;
export type FlightResolveResult = z.infer<typeof FlightResolveResultSchema>;
export type FlightInstanceWrite = FlightInstance & { canonicalKey: string };
