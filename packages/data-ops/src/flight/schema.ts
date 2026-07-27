import { z } from "zod";

const FLIGHT_NUMBER_PATTERN = /^([A-Z0-9]{2})(\d{1,4})$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function normalizeFlightNumber(value: string): string {
	return value
		.trim()
		.toUpperCase()
		.replace(/^([A-Z0-9]{2})\s+(\d{1,4})$/, "$1$2");
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

const FlightNumberSchema = z.preprocess(
	(value) => (typeof value === "string" ? normalizeFlightNumber(value) : value),
	z.string().superRefine((value, context) => {
		if (value.length === 0) {
			context.addIssue({ code: "custom", message: "Podaj numer lotu." });
			return;
		}
		if (!FLIGHT_NUMBER_PATTERN.test(value)) {
			context.addIssue({
				code: "custom",
				message: "Podaj kod przewoźnika i od 1 do 4 cyfr, np. FR1234.",
			});
		}
	}),
);

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

export const FlightResolveResultSchema = z.discriminatedUnion("status", [
	z.strictObject({
		status: z.literal("recognized"),
		flight: FlightInstanceSchema,
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
