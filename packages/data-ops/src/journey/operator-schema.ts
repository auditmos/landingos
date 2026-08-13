import { z } from "zod";
import { inspectJourneyExternalUrl } from "./external-links";
import { OPERATOR_CATALOG_FIELDS } from "./operator-fields";

const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const NullableDraftTextSchema = z.string().nullable().optional();
const NullableDraftIntegerSchema = z.number().int().nullable().optional();

export const TransferCatalogDraftInputSchema = z.strictObject({
	operatorName: NullableDraftTextSchema,
	serviceName: NullableDraftTextSchema,
	destinationStopCode: NullableDraftTextSchema,
	destinationStopName: NullableDraftTextSchema,
	durationMinutes: NullableDraftIntegerSchema,
	transferCount: NullableDraftIntegerSchema,
	walkingMinutes: NullableDraftIntegerSchema,
	walkingMeters: NullableDraftIntegerSchema,
	sourceUrl: NullableDraftTextSchema,
	checkedAt: NullableDraftTextSchema,
	costMinorMin: NullableDraftIntegerSchema,
	costMinorMax: NullableDraftIntegerSchema,
	purchaseUrl: NullableDraftTextSchema,
});

export const TransferCatalogDraftPatchSchema = TransferCatalogDraftInputSchema.refine(
	(input) => Object.keys(input).length > 0,
	"Wprowadź co najmniej jedną zmianę.",
);

export const TransferCatalogRecordSchema = z.strictObject({
	id: z.string().min(1),
	originIata: z.literal("BGY"),
	operatorName: z.string().nullable(),
	serviceName: z.string().nullable(),
	destinationStopCode: z.string().nullable(),
	destinationStopName: z.string().nullable(),
	durationMinutes: z.number().int().nullable(),
	transferCount: z.number().int().nullable(),
	walkingMinutes: z.number().int().nullable(),
	walkingMeters: z.number().int().nullable(),
	sourceUrl: z.string().nullable(),
	checkedAt: z.string().nullable(),
	costMinorMin: z.number().int().nullable(),
	costMinorMax: z.number().int().nullable(),
	purchaseUrl: z.string().nullable(),
	publicationStatus: z.enum(["draft", "published"]),
	provenance: z.enum(["operator_verified", "seeded_fixture"]),
	freshness: z.enum(["fresh", "stale", "incomplete"]),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type TransferCatalogDraftInput = z.infer<typeof TransferCatalogDraftInputSchema>;
export type TransferCatalogRecord = z.infer<typeof TransferCatalogRecordSchema>;
export type TransferCatalogEditableField = keyof TransferCatalogDraftInput;

export type TransferCatalogPublishValidation =
	| { ok: true }
	| {
			ok: false;
			fieldErrors: Partial<Record<TransferCatalogEditableField, string>>;
	  };

interface FreshnessOptions {
	now: Date;
	freshnessDays: number;
}

// Derived from the single field-definition map: no second list of Polish copy.
const requiredMessages = Object.fromEntries(
	OPERATOR_CATALOG_FIELDS.map((field) => [field.name, field.requiredMessage]),
) as Record<TransferCatalogEditableField, string>;

function isMissing(value: unknown): boolean {
	return value === null || value === undefined || (typeof value === "string" && !value.trim());
}

type CatalogFieldErrors = Partial<Record<TransferCatalogEditableField, string>>;

function validateRequiredFields(
	draft: TransferCatalogDraftInput,
	fieldErrors: CatalogFieldErrors,
): void {
	for (const field of Object.keys(requiredMessages) as TransferCatalogEditableField[]) {
		if (isMissing(draft[field])) fieldErrors[field] = requiredMessages[field];
	}
}

function validateNonNegativeIntegers(
	draft: TransferCatalogDraftInput,
	fieldErrors: CatalogFieldErrors,
): void {
	if (
		draft.durationMinutes !== null &&
		draft.durationMinutes !== undefined &&
		(!Number.isInteger(draft.durationMinutes) || draft.durationMinutes <= 0)
	) {
		fieldErrors.durationMinutes = "Czas trwania musi być dodatnią liczbą minut.";
	}
	for (const field of ["transferCount", "walkingMinutes", "walkingMeters"] as const) {
		const value = draft[field];
		if (value !== null && value !== undefined && (!Number.isInteger(value) || value < 0)) {
			fieldErrors[field] = "Wartość nie może być ujemna.";
		}
	}
}

function validatePrices(draft: TransferCatalogDraftInput, fieldErrors: CatalogFieldErrors): void {
	const minimum = draft.costMinorMin;
	const maximum = draft.costMinorMax;
	if (minimum !== null && minimum !== undefined && (!Number.isInteger(minimum) || minimum < 0)) {
		fieldErrors.costMinorMin = "Cena minimalna nie może być ujemna.";
	}
	if (maximum !== null && maximum !== undefined && (!Number.isInteger(maximum) || maximum < 0)) {
		fieldErrors.costMinorMax = "Cena maksymalna nie może być ujemna.";
		return;
	}
	if (
		minimum !== null &&
		minimum !== undefined &&
		maximum !== null &&
		maximum !== undefined &&
		maximum < minimum
	) {
		fieldErrors.costMinorMax = "Cena maksymalna nie może być niższa od minimalnej.";
	}
}

function validateExternalUrls(
	draft: TransferCatalogDraftInput,
	fieldErrors: CatalogFieldErrors,
): void {
	for (const field of ["sourceUrl", "purchaseUrl"] as const) {
		const value = draft[field];
		if (!isMissing(value)) {
			const inspection = inspectJourneyExternalUrl(value as string);
			if (!inspection.ok) fieldErrors[field] = inspection.message;
		}
	}
}

function validateCheckedAt(
	checkedAt: string | null | undefined,
	options: FreshnessOptions,
	fieldErrors: CatalogFieldErrors,
): void {
	if (isMissing(checkedAt)) return;
	const value = checkedAt as string;
	const checkedAtMs = Date.parse(value);
	if (!UTC_INSTANT_PATTERN.test(value) || Number.isNaN(checkedAtMs)) {
		fieldErrors.checkedAt = "Podaj prawidłową datę kontroli w UTC.";
		return;
	}
	if (checkedAtMs > options.now.getTime()) {
		fieldErrors.checkedAt = "Data kontroli nie może być z przyszłości.";
		return;
	}
	if (options.now.getTime() - checkedAtMs > options.freshnessDays * 24 * 60 * 60 * 1_000) {
		fieldErrors.checkedAt = `Dane są starsze niż ${options.freshnessDays} dni.`;
	}
}

export function validateTransferCatalogPublish(
	draft: TransferCatalogDraftInput,
	options: FreshnessOptions,
): TransferCatalogPublishValidation {
	const fieldErrors: CatalogFieldErrors = {};
	validateRequiredFields(draft, fieldErrors);
	validateNonNegativeIntegers(draft, fieldErrors);
	validatePrices(draft, fieldErrors);
	validateExternalUrls(draft, fieldErrors);
	validateCheckedAt(draft.checkedAt, options, fieldErrors);
	return Object.keys(fieldErrors).length === 0 ? { ok: true } : { ok: false, fieldErrors };
}

export function getTransferCatalogFreshness(
	draft: TransferCatalogDraftInput,
	options: FreshnessOptions,
): TransferCatalogRecord["freshness"] {
	const validation = validateTransferCatalogPublish(draft, options);
	if (validation.ok) return "fresh";
	const withoutAgeLimit = validateTransferCatalogPublish(draft, {
		...options,
		freshnessDays: Number.MAX_SAFE_INTEGER,
	});
	return withoutAgeLimit.ok ? "stale" : "incomplete";
}
