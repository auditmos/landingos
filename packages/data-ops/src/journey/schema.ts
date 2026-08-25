import { z } from "zod";
import { ProviderDiagnosticSchema } from "../diagnostics/schema";
import { ApprovedJourneyExternalUrlSchema } from "./external-links";

const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/**
 * Every request field below sets the type-level `error` as well as its content-level
 * messages. The two are separate zod parameters: without the former, a missing or
 * wrong-typed field answers with zod's English default and breaks the Polish-UI
 * constraint on the API surface (#50). Content messages still win where they apply.
 */
const UtcInstantSchema = z
	.string({ error: "Nieprawidłowy czas UTC." })
	.refine(
		(value) => UTC_INSTANT_PATTERN.test(value) && !Number.isNaN(Date.parse(value)),
		"Nieprawidłowy czas UTC.",
	);

export const JourneyBufferMinutesSchema = z
	.number({ error: "Podaj bufor w minutach." })
	.int("Bufor musi być pełną liczbą minut.")
	.min(15, "Bufor nie może być krótszy niż 15 minut.")
	.max(180, "Bufor nie może być dłuższy niż 180 minut.")
	.refine((value) => value % 5 === 0, "Bufor można zmieniać co 5 minut.");

export const JourneyRecommendationRequestSchema = z.strictObject({
	flightInstanceId: z
		.string({ error: "Wybierz rozpoznany lot." })
		.min(1, "Wybierz rozpoznany lot."),
	scheduledArrivalUtc: UtcInstantSchema,
	privateDestinationCoordinates: z.strictObject(
		{
			latitude: z
				.number({ error: "Nieprawidłowa szerokość geograficzna." })
				.min(-90, "Nieprawidłowa szerokość geograficzna.")
				.max(90, "Nieprawidłowa szerokość geograficzna."),
			longitude: z
				.number({ error: "Nieprawidłowa długość geograficzna." })
				.min(-180, "Nieprawidłowa długość geograficzna.")
				.max(180, "Nieprawidłowa długość geograficzna."),
		},
		{ error: "Brakuje współrzędnych miejsca docelowego." },
	),
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

/**
 * A published catalog entry rendered on its own. These are manually verified BGY →
 * stop transfer facts, never an end-to-end route to the traveler's destination: the
 * shape deliberately has no arrival time, no steps, and no ranking badge.
 */
export const CatalogTransferAlternativeSchema = z.strictObject({
	id: z.string().min(1),
	kind: z.literal("manually_verified_transfer"),
	operatorName: z.string().min(1),
	serviceName: z.string().min(1),
	destinationStopCode: z.string().min(1),
	destinationStopName: z.string().min(1),
	durationMinutes: z.number().int().positive(),
	transferCount: z.number().int().nonnegative(),
	walkingMinutes: z.number().int().nonnegative(),
	walkingMeters: z.number().int().nonnegative(),
	cost: JourneyCostSchema,
	source: JourneySourceReferenceSchema,
	freshness: z.enum(["fresh", "stale"]),
	purchaseLink: JourneyExternalLinkSchema.nullable(),
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
		catalogAlternatives: z.array(CatalogTransferAlternativeSchema),
		diagnostic: ProviderDiagnosticSchema.optional(),
	}),
	z.strictObject({
		status: z.literal("recommendation_unavailable"),
		reason: z.enum(["timeout", "rate_limited", "provider_error", "incomplete"]),
		manualAlternatives: z.array(JourneyExternalLinkSchema),
		catalogAlternatives: z.array(CatalogTransferAlternativeSchema),
		diagnostic: ProviderDiagnosticSchema.optional(),
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

export type CatalogTransferAlternative = z.infer<typeof CatalogTransferAlternativeSchema>;
export type JourneyRecommendationRequest = z.infer<typeof JourneyRecommendationRequestSchema>;
export type JourneyStep = z.infer<typeof JourneyStepSchema>;
export type JourneySourceReference = z.infer<typeof JourneySourceReferenceSchema>;
export type JourneyExternalLink = z.infer<typeof JourneyExternalLinkSchema>;
export type JourneyCost = z.infer<typeof JourneyCostSchema>;
export type JourneyVariant = z.infer<typeof JourneyVariantSchema>;
export type JourneyRecommendationResult = z.infer<typeof JourneyRecommendationResultSchema>;
export type TransferCatalogEntry = z.infer<typeof TransferCatalogEntrySchema>;
/**
 * A published entry as the traveler-facing modules receive it. The catalog query owns the
 * freshness verdict, so no consumer recomputes it from `checkedAt` against its own clock.
 */
export type PublishedTransferCatalogEntry = TransferCatalogEntry & {
	freshness: "fresh" | "stale";
};
export type TransferCatalogEntryWrite = Omit<TransferCatalogEntry, "createdAt" | "updatedAt">;
