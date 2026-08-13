import { z } from "zod";

const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/**
 * Provider-neutral failure taxonomy. It is the only vocabulary allowed to cross the
 * server boundary: it never names a provider, a plan, a credential, or a payload.
 */
export const PROVIDER_DIAGNOSTIC_CATEGORIES = [
	"quota_or_rate_limit",
	"plan_restricted",
	"access_configuration",
	"provider_coverage",
	"transient_outage",
	"malformed_response",
	"unknown_provider_failure",
] as const;

/** Polish traveler-facing data class: flight, place, or route. */
export const PROVIDER_CLASSES = ["lot", "miejsce", "trasa"] as const;

export const PROVIDER_RECOVERY_ACTIONS = ["retry", "manual", "change_parameters"] as const;

export const ProviderDiagnosticCategorySchema = z.enum(PROVIDER_DIAGNOSTIC_CATEGORIES);
export const ProviderClassSchema = z.enum(PROVIDER_CLASSES);
export const ProviderRecoveryActionSchema = z.enum(PROVIDER_RECOVERY_ACTIONS);

/**
 * `providerClass` and `category` are present only under the detailed exposure rule
 * (see `diagnosticExposure` in data-service). Production keeps the correlation
 * reference, the occurrence time, and the recovery action.
 */
export const ProviderDiagnosticSchema = z.strictObject({
	reference: z.string().min(1).max(64),
	occurredAtUtc: z
		.string()
		.refine(
			(value) => UTC_INSTANT_PATTERN.test(value) && !Number.isNaN(Date.parse(value)),
			"Nieprawidłowy czas UTC.",
		),
	recovery: ProviderRecoveryActionSchema,
	providerClass: ProviderClassSchema.optional(),
	category: ProviderDiagnosticCategorySchema.optional(),
});

export type ProviderDiagnosticCategory = z.infer<typeof ProviderDiagnosticCategorySchema>;
export type ProviderClass = z.infer<typeof ProviderClassSchema>;
export type ProviderRecoveryAction = z.infer<typeof ProviderRecoveryActionSchema>;
export type ProviderDiagnostic = z.infer<typeof ProviderDiagnosticSchema>;
