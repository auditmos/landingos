import { describe, expect, it } from "vitest";
import { checkProductionReadiness, resolveProviderConfig } from "./provider-config";

describe("provider runtime configuration", () => {
	it("defaults local work to fixture but rejects fixture in staging and production", () => {
		expect(resolveProviderConfig({})).toEqual({
			ok: true,
			config: { mode: "fixture", environment: "local" },
		});
		expect(
			resolveProviderConfig({
				CLOUDFLARE_ENV: "staging",
				LANDINGOS_PROVIDER_MODE: "fixture",
			}),
		).toEqual({
			ok: false,
			error: {
				status: "fixture_forbidden",
				environment: "staging",
			},
		});
		expect(
			resolveProviderConfig({
				CLOUDFLARE_ENV: "production",
				LANDINGOS_PROVIDER_MODE: "fixture",
			}),
		).toEqual({
			ok: false,
			error: {
				status: "fixture_forbidden",
				environment: "production",
			},
		});
		const implicitProduction = resolveProviderConfig({
			CLOUDFLARE_ENV: "production",
		});
		expect(implicitProduction.ok).toBe(false);
		expect(implicitProduction.ok ? implicitProduction.config.mode : undefined).not.toBe("live");
		const implicitStaging = resolveProviderConfig({
			CLOUDFLARE_ENV: "staging",
		});
		expect(implicitStaging.ok).toBe(false);
		expect(implicitStaging.ok ? implicitStaging.config.mode : undefined).not.toBe("fixture");
	});

	it("requires explicit provider selections and server-only credentials for live mode", () => {
		expect(resolveProviderConfig({ LANDINGOS_PROVIDER_MODE: "live" })).toEqual({
			ok: false,
			error: {
				status: "external_prerequisite_missing",
				missingVariables: [
					"LANDINGOS_FLIGHT_PROVIDER",
					"LANDINGOS_PLACES_PROVIDER",
					"LANDINGOS_TRANSIT_PROVIDER",
					"AVIATIONSTACK_ACCESS_KEY",
					"GOOGLE_MAPS_API_KEY",
				],
			},
		});

		const configured = resolveProviderConfig({
			CLOUDFLARE_ENV: "staging",
			LANDINGOS_PROVIDER_MODE: "live",
			LANDINGOS_FLIGHT_PROVIDER: "aviationstack",
			LANDINGOS_PLACES_PROVIDER: "google_places_new",
			LANDINGOS_TRANSIT_PROVIDER: "google_routes_transit",
			AVIATIONSTACK_ACCESS_KEY: "test-flight-key",
			GOOGLE_MAPS_API_KEY: "test-google-key",
		});

		expect(configured.ok).toBe(true);
		if (configured.ok && configured.config.mode === "live") {
			expect(configured.config.providers).toEqual({
				flight: "aviationstack",
				places: "google_places_new",
				transit: "google_routes_transit",
			});
		}
	});

	it("selects AeroDataBox live without requiring an AviationStack credential", () => {
		const configured = resolveProviderConfig({
			CLOUDFLARE_ENV: "staging",
			LANDINGOS_PROVIDER_MODE: "live",
			LANDINGOS_FLIGHT_PROVIDER: "aerodatabox",
			LANDINGOS_PLACES_PROVIDER: "google_places_new",
			LANDINGOS_TRANSIT_PROVIDER: "google_routes_transit",
			AERODATABOX_RAPIDAPI_KEY: "test-aero-key",
			GOOGLE_MAPS_API_KEY: "test-google-key",
		});

		expect(configured).toEqual({
			ok: true,
			config: {
				mode: "live",
				environment: "staging",
				providers: {
					flight: "aerodatabox",
					places: "google_places_new",
					transit: "google_routes_transit",
				},
				credentials: {
					flightProvider: "aerodatabox",
					aerodataboxRapidApiKey: "test-aero-key",
					googleMapsApiKey: "test-google-key",
				},
			},
		});
		expect(
			resolveProviderConfig({
				LANDINGOS_PROVIDER_MODE: "live",
				LANDINGOS_FLIGHT_PROVIDER: "aerodatabox",
				LANDINGOS_PLACES_PROVIDER: "google_places_new",
				LANDINGOS_TRANSIT_PROVIDER: "google_routes_transit",
				GOOGLE_MAPS_API_KEY: "test-google-key",
			}),
		).toEqual({
			ok: false,
			error: {
				status: "external_prerequisite_missing",
				missingVariables: ["AERODATABOX_RAPIDAPI_KEY"],
			},
		});
	});

	it("fails production readiness closed until live evidence and a GO decision are recorded", () => {
		const productionEnv = {
			CLOUDFLARE_ENV: "production",
			LANDINGOS_PROVIDER_MODE: "live",
			LANDINGOS_FLIGHT_PROVIDER: "aviationstack",
			LANDINGOS_PLACES_PROVIDER: "google_places_new",
			LANDINGOS_TRANSIT_PROVIDER: "google_routes_transit",
			AVIATIONSTACK_ACCESS_KEY: "test-flight-key",
			GOOGLE_MAPS_API_KEY: "test-google-key",
		};

		expect(
			checkProductionReadiness(productionEnv, {
				liveStatus: "not_run_missing_credentials",
				decision: "not_recorded",
				commercialLicensingAccepted: false,
				privacyComplianceApproved: false,
			}),
		).toEqual({
			ready: false,
			reasons: [
				"live_measurement_missing",
				"go_decision_missing",
				"commercial_licensing_acceptance_missing",
				"privacy_compliance_approval_missing",
			],
		});
		expect(
			checkProductionReadiness(productionEnv, {
				liveStatus: "complete",
				decision: "GO",
				commercialLicensingAccepted: false,
				privacyComplianceApproved: false,
			}),
		).toEqual({
			ready: false,
			reasons: ["commercial_licensing_acceptance_missing", "privacy_compliance_approval_missing"],
		});
		expect(
			checkProductionReadiness(productionEnv, {
				liveStatus: "complete",
				decision: "GO",
				commercialLicensingAccepted: true,
				privacyComplianceApproved: true,
			}),
		).toEqual({ ready: true, reasons: [] });
	});
});
