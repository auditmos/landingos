/**
 * The runtime variables data-service reads that the generated `Env` cannot express:
 * secrets Wrangler omits from `worker-configuration.d.ts` (they live in `.dev.vars` or
 * `wrangler secret`, never in `wrangler.jsonc`), plus `CLOUDFLARE_ENV`, which generation
 * pins to the literal `"dev"` of the env block it was generated from.
 *
 * Declared as named optional keys — never an index signature — so a mistyped variable
 * (`TURNSTILE_SECRETKEY`) is a compile error instead of a silent `undefined` that fails
 * closed on every staging/production request. `Env` is structurally assignable to this
 * interface, which is why widening needs no cast anywhere in the worker.
 */
export interface RuntimeVars {
	CLOUDFLARE_ENV?: string;
	TRANSFER_CATALOG_FRESHNESS_DAYS?: string;
	LANDINGOS_PROVIDER_MODE?: string;
	LANDINGOS_FLIGHT_PROVIDER?: string;
	LANDINGOS_PLACES_PROVIDER?: string;
	LANDINGOS_TRANSIT_PROVIDER?: string;
	AVIATIONSTACK_ACCESS_KEY?: string;
	AERODATABOX_RAPIDAPI_KEY?: string;
	GOOGLE_MAPS_API_KEY?: string;
	TURNSTILE_SECRET_KEY?: string;
	BETTER_AUTH_SECRET?: string;
	BETTER_AUTH_BASE_URL?: string;
	BETTER_AUTH_COOKIE_DOMAIN?: string;
}

/**
 * The single place the concrete `Env` widens to the optional-variable view. Accepting
 * `RuntimeVars` means the compiler proves the widening instead of a cast asserting it.
 */
export function runtimeVars(env: RuntimeVars): RuntimeVars {
	return env;
}
