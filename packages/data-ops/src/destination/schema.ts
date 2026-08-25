import { z } from "zod";
import { ProviderDiagnosticSchema } from "../diagnostics/schema";

/**
 * Every request field below sets the type-level `error` as well as its content-level
 * messages. The two are separate zod parameters: without the former, a missing or
 * wrong-typed field answers with zod's English default and breaks the Polish-UI
 * constraint on the API surface (#50). Content messages still win where they apply.
 */
const SessionTokenSchema = z
	.string({ error: "Brakuje sesji wyszukiwania miejsca." })
	.min(16, "Brakuje sesji wyszukiwania miejsca.")
	.max(128, "Sesja wyszukiwania miejsca jest nieprawidłowa.");

const DestinationQuerySchema = z.preprocess(
	(value) => (typeof value === "string" ? value.trim() : value),
	z.string({ error: "Wpisz co najmniej 3 znaki." }).min(3, "Wpisz co najmniej 3 znaki."),
);

export const DestinationAutocompleteRequestSchema = z.strictObject({
	query: DestinationQuerySchema,
	sessionToken: SessionTokenSchema,
});

export const DestinationSelectionRequestSchema = z.strictObject({
	placeId: z.string({ error: "Wybierz miejsce z listy." }).min(1, "Wybierz miejsce z listy."),
	sessionToken: SessionTokenSchema,
});

export const DestinationPredictionSchema = z.strictObject({
	placeId: z.string().min(1),
	primaryText: z.string().min(1),
	secondaryText: z.string().min(1),
});

const DestinationUnavailableReasonSchema = z.enum([
	"not_found",
	"timeout",
	"rate_limited",
	"provider_error",
	"incomplete",
]);

export const DestinationAutocompleteResultSchema = z.discriminatedUnion("status", [
	z.strictObject({
		status: z.literal("suggestions"),
		predictions: z.array(DestinationPredictionSchema),
	}),
	z.strictObject({
		status: z.literal("autocomplete_unavailable"),
		reason: DestinationUnavailableReasonSchema,
		diagnostic: ProviderDiagnosticSchema.optional(),
	}),
]);

export const PrivateDestinationSchema = z.strictObject({
	placeId: z.string().min(1),
	displayName: z.string().min(1),
	coordinates: z.strictObject({
		latitude: z.number().min(-90).max(90),
		longitude: z.number().min(-180).max(180),
	}),
	supportedAreaVersion: z.string().min(1),
});

export const DestinationSelectionResultSchema = z.discriminatedUnion("status", [
	z.strictObject({
		status: z.literal("destination_selected"),
		destination: PrivateDestinationSchema,
	}),
	z.strictObject({
		status: z.literal("destination_not_supported"),
		supportedAreaVersion: z.string().min(1),
	}),
	z.strictObject({
		status: z.literal("destination_unavailable"),
		reason: DestinationUnavailableReasonSchema,
		diagnostic: ProviderDiagnosticSchema.optional(),
	}),
]);

export type DestinationAutocompleteRequest = z.infer<typeof DestinationAutocompleteRequestSchema>;
export type DestinationSelectionRequest = z.infer<typeof DestinationSelectionRequestSchema>;
export type DestinationPrediction = z.infer<typeof DestinationPredictionSchema>;
export type DestinationAutocompleteResult = z.infer<typeof DestinationAutocompleteResultSchema>;
export type PrivateDestination = z.infer<typeof PrivateDestinationSchema>;
export type DestinationSelectionResult = z.infer<typeof DestinationSelectionResultSchema>;
export type DestinationUnavailableReason = z.infer<typeof DestinationUnavailableReasonSchema>;
