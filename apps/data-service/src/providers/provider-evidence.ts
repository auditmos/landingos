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

type ReadinessDecision = "not_recorded" | "GO" | "NO_GO";

export interface ProviderEvidence {
	schemaVersion: "s0-provider-readiness-v1";
	generatedOn: string;
	fixture: FixtureEvidence;
	live: MissingLiveEvidence | CompleteLiveEvidence;
	/**
	 * `decision` is the single authority on readiness. The locked fail-closed
	 * invariant — production is ready only on a GO with nothing left blocking it
	 * — is the definition of the serialized `ready` flag, so "ready but NO_GO"
	 * and "GO with blockers" cannot be written down here at all.
	 */
	productionReadiness: {
		decision: ReadinessDecision;
		blockers: string[];
	};
}

/** Wire shape of the committed `s0-provider-readiness-v1` artifact. */
export interface SerializedProviderEvidence extends Omit<ProviderEvidence, "productionReadiness"> {
	productionReadiness: {
		ready: boolean;
		decision: ReadinessDecision;
		blockers: string[];
	};
}

export function serializeProviderEvidence(evidence: ProviderEvidence): SerializedProviderEvidence {
	const { decision, blockers } = evidence.productionReadiness;
	return {
		...evidence,
		productionReadiness: {
			ready: decision === "GO" && blockers.length === 0,
			decision,
			blockers,
		},
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
			decision: "not_recorded",
			blockers: [
				...(liveEvidence.flightRecognition.status === "failing"
					? ["flight_recognition_below_9_of_10"]
					: []),
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
	const { decision, blockers } = evidence.productionReadiness;
	const claimsGo = decision === "GO";
	if (evidence.live.status !== "complete" && claimsGo) {
		issues.push("live evidence is required before a GO decision");
	}
	if (
		evidence.live.status === "complete" &&
		evidence.live.flightRecognition.status === "failing" &&
		claimsGo
	) {
		issues.push("9/10 correct live flight recognition is required before a GO decision");
	}
	if (claimsGo && blockers.length > 0) {
		issues.push("a GO decision cannot carry unresolved blockers");
	}
	return {
		valid: issues.length === 0,
		issues,
	};
}
