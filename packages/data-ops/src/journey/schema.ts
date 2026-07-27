import { z } from "zod";
import { ApprovedJourneyExternalUrlSchema } from "./external-links";

const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const UtcInstantSchema = z
	.string()
	.refine(
		(value) => UTC_INSTANT_PATTERN.test(value) && !Number.isNaN(Date.parse(value)),
		"Nieprawidłowy czas UTC.",
	);

export const JourneyBufferMinutesSchema = z
	.number()
	.int("Bufor musi być pełną liczbą minut.")
	.min(15, "Bufor nie może być krótszy niż 15 minut.")
	.max(180, "Bufor nie może być dłuższy niż 180 minut.")
	.refine((value) => value % 5 === 0, "Bufor można zmieniać co 5 minut.");

export const JourneyRecommendationRequestSchema = z.strictObject({
	flightInstanceId: z.string().min(1),
	scheduledArrivalUtc: UtcInstantSchema,
	privateDestinationCoordinates: z.strictObject({
		latitude: z.number().min(-90).max(90),
		longitude: z.number().min(-180).max(180),
	}),
	bufferMinutes: JourneyBufferMinutesSchema.default(45),
});

export const JourneyStepSchema = z.strictObject({
	mode: z.enum(["bus", "train", "metro", "tram", "walk"]),
	from: z.string().min(1),
	to: z.string().min(1),
	durationMinutes: z.number().int().nonnegative(),
	walkingMeters: z.number().int().nonnegative(),
});

export const JourneySourceReferenceSchema = z.strictObject({
	kind: z.enum(["provider", "catalog"]),
	label: z.string().min(1),
	url: ApprovedJourneyExternalUrlSchema.nullable(),
	checkedAt: UtcInstantSchema.nullable(),
});

export const JourneyExternalLinkSchema = z.strictObject({
	kind: z.enum(["purchase", "navigation", "source"]),
	label: z.string().min(1),
	url: ApprovedJourneyExternalUrlSchema,
});

export const JourneyCostSchema = z
	.strictObject({
		currency: z.literal("EUR"),
		minorMin: z.number().int().nonnegative().nullable(),
		minorMax: z.number().int().nonnegative().nullable(),
		completeness: z.enum(["complete", "partial", "unknown"]),
	})
	.refine(
		(value) =>
			value.minorMin === null || value.minorMax === null || value.minorMin <= value.minorMax,
		"Minimalna cena nie może przekraczać maksymalnej.",
	);

export const JourneyVariantSchema = z.strictObject({
	id: z.string().min(1),
	badges: z
		.array(z.enum(["recommended", "fastest", "simplest"]))
		.max(3)
		.refine((badges) => new Set(badges).size === badges.length),
	durationMinutes: z.number().int().positive(),
	arrivalTimeUtc: UtcInstantSchema,
	cost: JourneyCostSchema,
	transferCount: z.number().int().nonnegative(),
	walkingMinutes: z.number().int().nonnegative(),
	walkingMeters: z.number().int().nonnegative(),
	steps: z.array(JourneyStepSchema).min(1),
	sourceReferences: z.array(JourneySourceReferenceSchema).min(1),
	manualVerification: z
		.strictObject({
			checkedAt: UtcInstantSchema,
			freshness: z.enum(["fresh", "stale"]),
		})
		.nullable(),
	externalLinks: z.array(JourneyExternalLinkSchema),
});

export const JourneyRecommendationResultSchema = z.discriminatedUnion("status", [
	z.strictObject({
		status: z.literal("recommendations"),
		variants: z.array(JourneyVariantSchema).min(1).max(3),
		explanation: z.string().min(1).nullable(),
	}),
	z.strictObject({
		status: z.literal("no_trustworthy_route"),
		reason: z.enum(["zero_result", "no_post_arrival_route", "no_complete_itinerary"]),
		manualAlternatives: z.array(JourneyExternalLinkSchema),
	}),
	z.strictObject({
		status: z.literal("recommendation_unavailable"),
		reason: z.enum(["timeout", "rate_limited", "provider_error", "incomplete"]),
		manualAlternatives: z.array(JourneyExternalLinkSchema),
	}),
]);

export const TransferCatalogEntrySchema = z
	.strictObject({
		id: z.string().min(1),
		operatorName: z.string().min(1),
		serviceName: z.string().min(1),
		originIata: z.literal("BGY"),
		destinationStopCode: z.string().min(1),
		destinationStopName: z.string().min(1),
		durationMinutes: z.number().int().positive(),
		transferCount: z.number().int().nonnegative(),
		walkingMinutes: z.number().int().nonnegative(),
		walkingMeters: z.number().int().nonnegative(),
		sourceUrl: ApprovedJourneyExternalUrlSchema,
		checkedAt: UtcInstantSchema,
		costMinorMin: z.number().int().nonnegative(),
		costMinorMax: z.number().int().nonnegative(),
		purchaseUrl: ApprovedJourneyExternalUrlSchema,
		publicationStatus: z.literal("published"),
		provenance: z.enum(["seeded_fixture", "operator_verified"]),
		createdAt: UtcInstantSchema,
		updatedAt: UtcInstantSchema,
	})
	.refine(
		(entry) => entry.costMinorMin <= entry.costMinorMax,
		"Minimalna cena katalogowa nie może przekraczać maksymalnej.",
	);

export type JourneyRecommendationRequest = z.infer<typeof JourneyRecommendationRequestSchema>;
export type JourneyStep = z.infer<typeof JourneyStepSchema>;
export type JourneySourceReference = z.infer<typeof JourneySourceReferenceSchema>;
export type JourneyExternalLink = z.infer<typeof JourneyExternalLinkSchema>;
export type JourneyCost = z.infer<typeof JourneyCostSchema>;
export type JourneyVariant = z.infer<typeof JourneyVariantSchema>;
export type JourneyRecommendationResult = z.infer<typeof JourneyRecommendationResultSchema>;
export type TransferCatalogEntry = z.infer<typeof TransferCatalogEntrySchema>;
export type TransferCatalogEntryWrite = Omit<TransferCatalogEntry, "createdAt" | "updatedAt">;
