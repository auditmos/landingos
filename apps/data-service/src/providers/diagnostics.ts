import type {
	ProviderClass,
	ProviderDiagnostic,
	ProviderDiagnosticCategory,
	ProviderRecoveryAction,
} from "@repo/data-ops/diagnostics";
import type { ProviderResult } from "./types";

export type { ProviderClass, ProviderDiagnostic, ProviderDiagnosticCategory };

/**
 * Normalized, provider-neutral signal derived from a *documented* provider error
 * code. `unrecognized_access_denied` is the deliberate catch-all: an HTTP status
 * alone never justifies a plan, billing, or quota attribution.
 */
export type ProviderErrorSignal =
	| "quota_exceeded"
	| "rate_limited"
	| "plan_feature_restricted"
	| "credential_invalid"
	| "billing_disabled"
	| "service_disabled"
	| "unrecognized_access_denied";

export type DiagnosticExposure = "detailed" | "minimal";

/**
 * Aviationstack documented `error.code` values.
 * <https://aviationstack.com/documentation> — plan limits are stated per account, so
 * only these exact codes may be read as plan/quota facts.
 */
const AVIATIONSTACK_SIGNALS: Readonly<Record<string, ProviderErrorSignal>> = {
	usage_limit_reached: "quota_exceeded",
	rate_limit_reached: "rate_limited",
	function_access_restricted: "plan_feature_restricted",
	https_access_restricted: "plan_feature_restricted",
	invalid_access_key: "credential_invalid",
	missing_access_key: "credential_invalid",
	inactive_user: "credential_invalid",
};

/**
 * Google Maps Platform documented `error.status` values. Google has no plan tiers —
 * billing is required and each SKU has its own cap — so no Google code ever maps to
 * `plan_feature_restricted`.
 * <https://developers.google.com/maps/documentation/places/web-service/usage-and-billing>
 */
const GOOGLE_STATUS_SIGNALS: Readonly<Record<string, ProviderErrorSignal>> = {
	RESOURCE_EXHAUSTED: "quota_exceeded",
	UNAUTHENTICATED: "credential_invalid",
};

/** Google `error.details[].reason` values. */
const GOOGLE_REASON_SIGNALS: Readonly<Record<string, ProviderErrorSignal>> = {
	RATE_LIMIT_EXCEEDED: "quota_exceeded",
	rateLimitExceeded: "quota_exceeded",
	BILLING_DISABLED: "billing_disabled",
	SERVICE_DISABLED: "service_disabled",
	API_KEY_SERVICE_BLOCKED: "service_disabled",
	API_KEY_INVALID: "credential_invalid",
	API_KEY_HTTP_REFERRER_BLOCKED: "service_disabled",
};

function readString(source: Record<string, unknown>, key: string): string | undefined {
	const value = source[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function errorEnvelope(body: unknown): Record<string, unknown> | undefined {
	if (typeof body !== "object" || body === null) return undefined;
	const envelope = (body as { error?: unknown }).error;
	return typeof envelope === "object" && envelope !== null
		? (envelope as Record<string, unknown>)
		: undefined;
}

function googleReasonSignal(envelope: Record<string, unknown>): ProviderErrorSignal | undefined {
	const details = envelope.details;
	if (!Array.isArray(details)) return undefined;
	for (const detail of details) {
		if (typeof detail !== "object" || detail === null) continue;
		const reason = readString(detail as Record<string, unknown>, "reason");
		const signal = reason === undefined ? undefined : GOOGLE_REASON_SIGNALS[reason];
		if (signal) return signal;
	}
	return undefined;
}

/**
 * Reads a documented provider error code out of a parsed error body. Anything not on
 * the allowlist is ignored — the caller then falls back to a status-only, unattributed
 * classification. No provider text is ever retained.
 */
export function readProviderErrorSignal(body: unknown): ProviderErrorSignal | undefined {
	const envelope = errorEnvelope(body);
	if (!envelope) return undefined;
	const code = readString(envelope, "code");
	const aviationstack = code === undefined ? undefined : AVIATIONSTACK_SIGNALS[code];
	if (aviationstack) return aviationstack;
	const googleStatus = readString(envelope, "status");
	const byReason = googleReasonSignal(envelope);
	if (byReason) return byReason;
	return googleStatus === undefined ? undefined : GOOGLE_STATUS_SIGNALS[googleStatus];
}

type FailureResult = Exclude<ProviderResult<unknown, unknown>, { status: "success" }>;

function accessDeniedStatus(httpStatus: number): boolean {
	return httpStatus === 401 || httpStatus === 403;
}

function signalCategory(signal: ProviderErrorSignal): ProviderDiagnosticCategory {
	switch (signal) {
		case "quota_exceeded":
		case "rate_limited":
			return "quota_or_rate_limit";
		case "plan_feature_restricted":
			return "plan_restricted";
		case "credential_invalid":
		case "billing_disabled":
		case "service_disabled":
		case "unrecognized_access_denied":
			return "access_configuration";
	}
}

/**
 * Maps a normalized provider outcome onto exactly one diagnostic category.
 * Returns `null` for a successful outcome — including several valid alternatives.
 */
export function classifyProviderOutcome(
	result: ProviderResult<unknown, unknown>,
): ProviderDiagnosticCategory | null {
	switch (result.status) {
		case "success":
			return null;
		case "timeout":
			return "transient_outage";
		case "rate_limited":
			return "quota_or_rate_limit";
		case "zero_result":
		case "ambiguous":
			return "provider_coverage";
		case "incomplete_response":
		case "malformed_response":
			return "malformed_response";
		case "provider_error": {
			if (result.signal) return signalCategory(result.signal);
			if (result.httpStatus >= 500 || result.httpStatus === 0) return "transient_outage";
			if (accessDeniedStatus(result.httpStatus)) return "access_configuration";
			return "unknown_provider_failure";
		}
	}
}

const RECOVERY_BY_CLASS: Readonly<
	Record<ProviderClass, Readonly<Record<ProviderDiagnosticCategory, ProviderRecoveryAction>>>
> = {
	// A flight always keeps the manual arrival fallback (#16).
	lot: {
		quota_or_rate_limit: "retry",
		transient_outage: "retry",
		unknown_provider_failure: "retry",
		provider_coverage: "change_parameters",
		plan_restricted: "manual",
		access_configuration: "manual",
		malformed_response: "manual",
	},
	// A destination has no manual path: the traveler retries or changes the input.
	miejsce: {
		quota_or_rate_limit: "retry",
		transient_outage: "retry",
		unknown_provider_failure: "retry",
		access_configuration: "retry",
		plan_restricted: "retry",
		provider_coverage: "change_parameters",
		malformed_response: "change_parameters",
	},
	// A journey falls back to the published catalog alternatives.
	trasa: {
		quota_or_rate_limit: "retry",
		transient_outage: "retry",
		unknown_provider_failure: "retry",
		provider_coverage: "change_parameters",
		plan_restricted: "manual",
		access_configuration: "manual",
		malformed_response: "manual",
	},
};

/**
 * Explicit environment rule for diagnostic exposure. Only a known non-production
 * runtime gets the expandable QA detail; anything unknown fails closed to minimal.
 */
export function diagnosticExposure(env: Record<string, string | undefined>): DiagnosticExposure {
	return DETAILED_DIAGNOSTIC_ENVIRONMENTS.has(env.CLOUDFLARE_ENV ?? "") ? "detailed" : "minimal";
}

const DETAILED_DIAGNOSTIC_ENVIRONMENTS: ReadonlySet<string> = new Set([
	"local",
	"dev",
	"test",
	"staging",
]);

export interface ProviderDiagnosticInput {
	providerClass: ProviderClass;
	result: FailureResult | ProviderResult<unknown, unknown>;
	reference: string;
	exposure: DiagnosticExposure;
	now?: Date;
}

/**
 * Builds the safe diagnostic attached to a domain failure. The output is composed of
 * fixed vocabulary plus the caller-supplied correlation reference — no provider text,
 * payload, credential, email, or destination data can reach it.
 */
export function buildProviderDiagnostic(input: ProviderDiagnosticInput): ProviderDiagnostic {
	const category = classifyProviderOutcome(input.result) ?? "unknown_provider_failure";
	const occurredAt = input.now ?? new Date();
	const base = {
		reference: input.reference.slice(0, 64),
		occurredAtUtc: occurredAt.toISOString(),
		recovery: RECOVERY_BY_CLASS[input.providerClass][category],
	};
	return input.exposure === "detailed"
		? { ...base, providerClass: input.providerClass, category }
		: base;
}

export interface DiagnosticContext {
	providerClass: ProviderClass;
	reference: string;
	exposure: DiagnosticExposure;
	now?: () => Date;
}

/** Convenience wrapper for domain services that carry a `DiagnosticContext`. */
export function contextDiagnostic(
	context: DiagnosticContext | undefined,
	result: ProviderResult<unknown, unknown>,
): ProviderDiagnostic | undefined {
	if (!context) return undefined;
	return buildProviderDiagnostic({
		providerClass: context.providerClass,
		result,
		reference: context.reference,
		exposure: context.exposure,
		...(context.now ? { now: context.now() } : {}),
	});
}
