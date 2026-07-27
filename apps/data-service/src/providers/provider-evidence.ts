import type { FixtureSpikeSummary } from "./fixture-spike";
import type { LiveSpikeEvidence } from "./live-spike";
import { REQUIRED_LIVE_VARIABLES } from "./provider-config";

interface FixtureEvidence {
	status: "complete";
	datasetLabel: "synthetic_recorded_for_testing";
	summary: FixtureSpikeSummary;
}

interface MissingLiveEvidence {
	status: "not_run_missing_credentials";
	missingVariables: string[];
	resumeCommand: "pnpm run spike:data";
}

export type CompleteLiveEvidence = LiveSpikeEvidence;

export interface ProviderEvidence {
	schemaVersion: "s0-provider-readiness-v1";
	generatedOn: string;
	fixture: FixtureEvidence;
	live: MissingLiveEvidence | CompleteLiveEvidence;
	productionReadiness: {
		ready: boolean;
		decision: "not_recorded" | "GO" | "NO_GO";
		blockers: string[];
	};
}

export interface EvidenceValidationResult {
	valid: boolean;
	issues: string[];
}

export function createMissingLiveEvidence(
	fixtureSummary: FixtureSpikeSummary,
	generatedOn: string,
): ProviderEvidence {
	return {
		schemaVersion: "s0-provider-readiness-v1",
		generatedOn,
		fixture: {
			status: "complete",
			datasetLabel: "synthetic_recorded_for_testing",
			summary: fixtureSummary,
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
	};
}

export function createCompleteProviderEvidence(
	fixtureSummary: FixtureSpikeSummary,
	liveEvidence: CompleteLiveEvidence,
	generatedOn: string,
): ProviderEvidence {
	return {
		schemaVersion: "s0-provider-readiness-v1",
		generatedOn,
		fixture: {
			status: "complete",
			datasetLabel: "synthetic_recorded_for_testing",
			summary: fixtureSummary,
		},
		live: liveEvidence,
		productionReadiness: {
			ready: false,
			decision: "not_recorded",
			blockers: [
				"official_result_quality_review_missing",
				"billing_cost_evidence_missing",
				"commercial_licensing_acceptance_missing",
				"independent_privacy_compliance_approval_missing",
			],
		},
	};
}

export function validateProviderEvidence(evidence: ProviderEvidence): EvidenceValidationResult {
	const issues: string[] = [];
	if (
		evidence.live.status !== "complete" &&
		(evidence.productionReadiness.ready || evidence.productionReadiness.decision === "GO")
	) {
		issues.push("live evidence is required before a GO decision");
	}
	return {
		valid: issues.length === 0,
		issues,
	};
}
