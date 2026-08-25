import { type ProviderDiagnostic, ProviderDiagnosticSchema } from "@repo/data-ops/diagnostics";
import type { Context } from "hono";
import { type DiagnosticContext, diagnosticExposure, type ProviderClass } from "../../providers";

/**
 * Builds the request-scoped diagnostic context: the correlation reference comes from
 * the request-id middleware (or the caller's own header), the exposure from the
 * explicit environment rule.
 */
export function requestDiagnosticContext(
	c: Context<{ Bindings: Env }>,
	providerClass: ProviderClass,
): DiagnosticContext {
	const requestId = c.get("requestId") as string | undefined;
	return {
		providerClass,
		reference: requestId ?? c.req.header("x-request-id") ?? crypto.randomUUID(),
		exposure: diagnosticExposure(c.env),
	};
}

/**
 * Re-parses the diagnostic against its strict schema on the way out, so a response can
 * only ever carry the exact allowlisted fields.
 */
export function publicDiagnostic(
	diagnostic: ProviderDiagnostic | undefined,
): { diagnostic: ProviderDiagnostic } | Record<string, never> {
	return diagnostic ? { diagnostic: ProviderDiagnosticSchema.parse(diagnostic) } : {};
}
