import { runFixtureSpike } from "../apps/data-service/src/providers/fixture-spike";
import type { ProviderFetch } from "../apps/data-service/src/providers/live-http";
import { runLiveSpike } from "../apps/data-service/src/providers/live-spike";
import { resolveProviderConfig } from "../apps/data-service/src/providers/provider-config";
import {
	createCompleteProviderEvidence,
	serializeProviderEvidence,
	validateProviderEvidence,
} from "../apps/data-service/src/providers/provider-evidence";

export type SpikeMode = "fixture" | "live";

interface ExecuteProviderSpikeOptions {
	mode: SpikeMode;
	env: Record<string, string | undefined>;
	fetchImpl: ProviderFetch;
	nowMs: () => number;
	generatedAt: string;
	onProgress: (message: string) => void;
	sleep?: (milliseconds: number) => Promise<void>;
}

export interface ProviderSpikeCommandResult {
	exitCode: 0 | 1 | 2;
	payload: unknown;
}

export async function executeProviderSpike(
	options: ExecuteProviderSpikeOptions,
): Promise<ProviderSpikeCommandResult> {
	const config = resolveProviderConfig({
		...options.env,
		LANDINGOS_PROVIDER_MODE: options.mode,
	});
	if (!config.ok) {
		if (config.error.status === "external_prerequisite_missing") {
			return {
				exitCode: 2,
				payload: {
					status: "external_prerequisite_missing",
					liveStatus: "not_run_missing_credentials",
					missingVariables: config.error.missingVariables,
					resumeCommand: "pnpm run spike:data",
				},
			};
		}
		return { exitCode: 1, payload: config.error };
	}

	if (options.mode === "fixture") {
		return {
			exitCode: 0,
			payload: await runFixtureSpike(),
		};
	}
	if (config.config.mode !== "live") {
		return {
			exitCode: 1,
			payload: { status: "invalid_live_configuration" },
		};
	}

	const fixtureSummary = await runFixtureSpike();
	const liveEvidence = await runLiveSpike({
		credentials: config.config.credentials,
		fetchImpl: options.fetchImpl,
		nowMs: options.nowMs,
		generatedAt: options.generatedAt,
		onProgress: options.onProgress,
		sleep: options.sleep,
	});
	const evidence = createCompleteProviderEvidence(
		fixtureSummary,
		liveEvidence,
		options.generatedAt.slice(0, 10),
	);
	const validation = validateProviderEvidence(evidence);
	if (!validation.valid) {
		return {
			exitCode: 1,
			payload: {
				status: "invalid_evidence",
				issues: validation.issues,
			},
		};
	}
	return {
		exitCode: liveEvidence.flightRecognition.status === "passing" ? 0 : 1,
		// `ready` exists only on the wire, derived from the decision — the model
		// never carries a readiness claim that could drift from it.
		payload: serializeProviderEvidence(evidence),
	};
}
