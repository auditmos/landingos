import type { RuntimeVars } from "../runtime-vars";

type RuntimeEnvironment = "local" | "dev" | "test" | "staging" | "production";

type ProviderEnvironment = RuntimeVars;

interface FixtureProviderConfig {
	mode: "fixture";
	environment: RuntimeEnvironment;
}

interface LiveProviderConfig {
	mode: "live";
	environment: RuntimeEnvironment;
	providers: {
		flight: "aviationstack";
		places: "google_places_new";
		transit: "google_routes_transit";
	};
	credentials: {
		aviationstackAccessKey: string;
		googleMapsApiKey: string;
	};
}

interface FixtureForbidden {
	status: "fixture_forbidden";
	environment: "staging" | "production";
}

interface ExternalPrerequisiteMissing {
	status: "external_prerequisite_missing";
	missingVariables: string[];
}

interface InvalidProviderMode {
	status: "invalid_provider_mode";
	received: string;
}

interface InvalidProviderSelection {
	status: "invalid_provider_selection";
	variable: string;
	received: string;
}

export type ProviderConfigResult =
	| { ok: true; config: FixtureProviderConfig | LiveProviderConfig }
	| {
			ok: false;
			error:
				| FixtureForbidden
				| ExternalPrerequisiteMissing
				| InvalidProviderMode
				| InvalidProviderSelection;
	  };

export interface ProviderReadinessEvidence {
	liveStatus: "not_run_missing_credentials" | "complete";
	decision: "not_recorded" | "GO" | "NO_GO";
	commercialLicensingAccepted: boolean;
	privacyComplianceApproved: boolean;
}

export interface ProviderReadinessResult {
	ready: boolean;
	reasons: string[];
}

export const REQUIRED_LIVE_VARIABLES = [
	"LANDINGOS_FLIGHT_PROVIDER",
	"LANDINGOS_PLACES_PROVIDER",
	"LANDINGOS_TRANSIT_PROVIDER",
	"AVIATIONSTACK_ACCESS_KEY",
	"GOOGLE_MAPS_API_KEY",
] as const;

function runtimeEnvironment(value: string | undefined): RuntimeEnvironment {
	if (value === "dev" || value === "test" || value === "staging" || value === "production") {
		return value;
	}
	return "local";
}

function isDeployedEnvironment(
	environment: RuntimeEnvironment,
): environment is "staging" | "production" {
	return environment === "staging" || environment === "production";
}

function resolveLiveProviderConfig(
	env: ProviderEnvironment,
	environment: RuntimeEnvironment,
): ProviderConfigResult {
	const missingVariables = REQUIRED_LIVE_VARIABLES.filter((variable) => !env[variable]?.trim());
	if (missingVariables.length > 0) {
		return {
			ok: false,
			error: {
				status: "external_prerequisite_missing",
				missingVariables: [...missingVariables],
			},
		};
	}
	const selections = [
		["LANDINGOS_FLIGHT_PROVIDER", env.LANDINGOS_FLIGHT_PROVIDER, "aviationstack"],
		["LANDINGOS_PLACES_PROVIDER", env.LANDINGOS_PLACES_PROVIDER, "google_places_new"],
		["LANDINGOS_TRANSIT_PROVIDER", env.LANDINGOS_TRANSIT_PROVIDER, "google_routes_transit"],
	] as const;
	for (const [variable, received, expected] of selections) {
		if (received !== expected) {
			return {
				ok: false,
				error: {
					status: "invalid_provider_selection",
					variable,
					received: received ?? "",
				},
			};
		}
	}
	return {
		ok: true,
		config: {
			mode: "live",
			environment,
			providers: {
				flight: "aviationstack",
				places: "google_places_new",
				transit: "google_routes_transit",
			},
			credentials: {
				aviationstackAccessKey: env.AVIATIONSTACK_ACCESS_KEY as string,
				googleMapsApiKey: env.GOOGLE_MAPS_API_KEY as string,
			},
		},
	};
}

export function resolveProviderConfig(env: ProviderEnvironment): ProviderConfigResult {
	const environment = runtimeEnvironment(env.CLOUDFLARE_ENV);
	const requestedMode = env.LANDINGOS_PROVIDER_MODE;

	if (isDeployedEnvironment(environment) && requestedMode === "fixture") {
		return {
			ok: false,
			error: { status: "fixture_forbidden", environment },
		};
	}
	if (isDeployedEnvironment(environment) && requestedMode === undefined) {
		return {
			ok: false,
			error: {
				status: "external_prerequisite_missing",
				missingVariables: ["LANDINGOS_PROVIDER_MODE"],
			},
		};
	}
	if (requestedMode === undefined || requestedMode === "fixture") {
		return {
			ok: true,
			config: { mode: "fixture", environment },
		};
	}
	if (requestedMode === "live") {
		return resolveLiveProviderConfig(env, environment);
	}
	return {
		ok: false,
		error: { status: "invalid_provider_mode", received: requestedMode },
	};
}

export function checkProductionReadiness(
	env: ProviderEnvironment,
	evidence: ProviderReadinessEvidence,
): ProviderReadinessResult {
	const config = resolveProviderConfig(env);
	if (!config.ok) {
		return {
			ready: false,
			reasons: [config.error.status],
		};
	}
	if (config.config.mode !== "live") {
		return {
			ready: false,
			reasons: ["live_provider_mode_required"],
		};
	}

	const reasons: string[] = [];
	if (evidence.liveStatus !== "complete") {
		reasons.push("live_measurement_missing");
	}
	if (evidence.decision !== "GO") {
		reasons.push("go_decision_missing");
	}
	if (!evidence.commercialLicensingAccepted) {
		reasons.push("commercial_licensing_acceptance_missing");
	}
	if (!evidence.privacyComplianceApproved) {
		reasons.push("privacy_compliance_approval_missing");
	}
	return {
		ready: reasons.length === 0,
		reasons,
	};
}
