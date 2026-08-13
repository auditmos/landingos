import { describe, expect, it } from "vitest";
import { runFixtureSpike } from "./fixture-spike";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";
import { REQUIRED_LIVE_VARIABLES } from "./provider-config";
import {
	createCompleteProviderEvidence,
	createMissingLiveEvidence,
	validateProviderEvidence,
} from "./provider-evidence";

describe("provider readiness evidence", () => {
	it("distinguishes deterministic fixtures from missing live measurements and GO", async () => {
		const fixtureSummary = await runFixtureSpike();
		const evidence = createMissingLiveEvidence(fixtureSummary, "2026-07-27");

		expect(evidence).toMatchObject({
			schemaVersion: "s0-provider-readiness-v1",
			generatedOn: "2026-07-27",
			fixture: {
				status: "complete",
				datasetLabel: "synthetic_recorded_for_testing",
			},
			live: {
				status: "not_run_missing_credentials",
				missingVariables: [...REQUIRED_LIVE_VARIABLES],
				resumeCommand: "pnpm run spike:data",
			},
			productionReadiness: {
				ready: false,
				decision: "not_recorded",
				blockers: [
					"live_provider_measurement_missing",
					"commercial_licensing_acceptance_missing",
					"independent_privacy_compliance_approval_missing",
				],
			},
		});
		expect(validateProviderEvidence(evidence)).toEqual({
			valid: true,
			issues: [],
		});

		const fabricatedGo = {
			...evidence,
			productionReadiness: {
				...evidence.productionReadiness,
				ready: true,
				decision: "GO" as const,
				blockers: [],
			},
		};
		expect(validateProviderEvidence(fabricatedGo)).toEqual({
			valid: false,
			issues: ["live evidence is required before a GO decision"],
		});
	});

	it("keeps production closed after measurement until reviews are recorded", async () => {
		const fixtureSummary = await runFixtureSpike();
		const completeLiveEvidence = {
			status: "complete" as const,
			generatedAt: "2026-07-27T12:00:00.000Z",
			providers: {
				flight: "aviationstack" as const,
				places: "google_places_new" as const,
				transit: "google_routes_transit" as const,
			},
			coverage: {
				flight: { total: 10, successful: 10 },
				places: { total: 5, successful: 5 },
				transit: { total: 10, successful: 10 },
			},
			resultQuality: {
				status: "unreviewed_against_official_sources" as const,
			},
			flightRecognition: {
				total: 10,
				correct: 10,
				requiredCorrect: 9,
				status: "passing" as const,
				requiredDecision: null,
			},
			callCount: 25,
			latencyMs: { sampleCount: 25, p50: 100, p95: 200 },
			billing: {
				units: {
					aviationstackCalls: 10,
					googlePlacesAutocompleteCalls: 5,
					googleRoutesComputeCalls: 10,
				},
				cost: {
					status: "not_calculated_billing_export_required" as const,
					currency: "USD" as const,
					amount: null,
				},
			},
			viewport: MILAN_MUNICIPALITY_VIEWPORT,
			sources: [],
			providerTerms: [],
			scenarioResults: [],
		};

		const evidence = createCompleteProviderEvidence(
			fixtureSummary,
			completeLiveEvidence,
			"2026-07-27",
		);

		expect(evidence.productionReadiness).toEqual({
			ready: false,
			decision: "not_recorded",
			blockers: [
				"official_result_quality_review_missing",
				"billing_cost_evidence_missing",
				"commercial_licensing_acceptance_missing",
				"independent_privacy_compliance_approval_missing",
			],
		});
		expect(validateProviderEvidence(evidence)).toEqual({
			valid: true,
			issues: [],
		});

		const failingEvidence = createCompleteProviderEvidence(
			fixtureSummary,
			{
				...completeLiveEvidence,
				flightRecognition: {
					total: 10,
					correct: 8,
					requiredCorrect: 9,
					status: "failing",
					requiredDecision:
						"reconfigure_aviationstack_for_scheduled_flight_coverage_or_replace_provider",
				},
			},
			"2026-07-27",
		);
		expect(failingEvidence.productionReadiness.blockers).toContain(
			"flight_recognition_below_9_of_10",
		);
		expect(
			validateProviderEvidence({
				...failingEvidence,
				productionReadiness: {
					ready: true,
					decision: "GO",
					blockers: [],
				},
			}),
		).toEqual({
			valid: false,
			issues: ["9/10 correct live flight recognition is required before a GO decision"],
		});
	});
});
