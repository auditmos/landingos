import type { RuntimeVars } from "../runtime-vars";
import { createFixtureProviderAdapters } from "./fixture-adapters";
import { createLiveProviderAdapters } from "./live-adapters";
import type { ProviderFetch } from "./live-http";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";
import { resolveProviderConfig } from "./provider-config";
import type { ProviderAdapters } from "./types";

/**
 * The one degraded outcome every contract reports when no provider mode could be
 * resolved: retryable, never cached, never mistaken for an answer.
 */
const PROVIDER_UNAVAILABLE = {
	status: "provider_error",
	httpStatus: 503,
	retryable: true,
} as const;

/**
 * Adapters for a runtime whose provider mode did not resolve — a deployed environment
 * asking for fixtures, an implicit mode in staging/production, missing live credentials.
 *
 * Every contract reports the degraded state, `transferCatalog` included. Live adapters
 * answer `zero_result` there because live genuinely has no provider-side catalog; an
 * unconfigured runtime knows nothing, and "no transfers exist" is a factual claim it
 * cannot make. The viewport is still advertised: `milan-municipality-v1` is checked-in
 * corridor scope, not provider data, so out-of-area destinations stay rejected locally.
 */
export function createUnavailableProviderAdapters(): ProviderAdapters {
	return {
		mode: "unavailable",
		flight: { lookup: async () => PROVIDER_UNAVAILABLE },
		places: {
			viewport: MILAN_MUNICIPALITY_VIEWPORT,
			autocomplete: async () => PROVIDER_UNAVAILABLE,
			details: async () => PROVIDER_UNAVAILABLE,
		},
		transit: { route: async () => PROVIDER_UNAVAILABLE },
		transferCatalog: { list: async () => PROVIDER_UNAVAILABLE },
	};
}

/**
 * The single mode decision for the whole worker: runtime variables in, ready adapters
 * out. Live is only ever selected by an explicit, fully configured `live` mode — every
 * other outcome, including a typed configuration error, collapses to the degraded
 * adapters above rather than reaching for a provider.
 */
export function resolveProviderAdapters(
	env: RuntimeVars,
	fetchImpl: ProviderFetch = (input, init) => fetch(input, init),
): ProviderAdapters {
	const config = resolveProviderConfig(env);
	if (!config.ok) {
		return createUnavailableProviderAdapters();
	}
	return config.config.mode === "live"
		? createLiveProviderAdapters(config.config.credentials, fetchImpl)
		: createFixtureProviderAdapters();
}
