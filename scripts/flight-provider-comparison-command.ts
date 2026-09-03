import {
	type FlightProviderComparisonEvidence,
	runFlightProviderComparison,
} from "../apps/data-service/src/providers/flight-provider-comparison";
import type { ProviderFetch } from "../apps/data-service/src/providers/live-http";

interface ExecuteFlightProviderComparisonOptions {
	env: Record<string, string | undefined>;
	fetchImpl: ProviderFetch;
	generatedAt: string;
	nowMs: () => number;
	onProgress: (message: string) => void;
	sleep?: (milliseconds: number) => Promise<void>;
}

export interface FlightProviderComparisonCommandResult {
	exitCode: 0 | 1 | 2;
	payload:
		| FlightProviderComparisonEvidence
		| {
				status: "external_prerequisite_missing";
				missingVariables: string[];
				resumeCommand: "pnpm run spike:flights:compare";
		  };
}

const REQUIRED_VARIABLES = ["AVIATIONSTACK_ACCESS_KEY", "AERODATABOX_RAPIDAPI_KEY"] as const;

export async function executeFlightProviderComparison(
	options: ExecuteFlightProviderComparisonOptions,
): Promise<FlightProviderComparisonCommandResult> {
	const missingVariables = REQUIRED_VARIABLES.filter((variable) => !options.env[variable]?.trim());
	if (missingVariables.length > 0) {
		return {
			exitCode: 2,
			payload: {
				status: "external_prerequisite_missing",
				missingVariables: [...missingVariables],
				resumeCommand: "pnpm run spike:flights:compare",
			},
		};
	}

	const payload = await runFlightProviderComparison({
		credentials: {
			aviationstackAccessKey: options.env.AVIATIONSTACK_ACCESS_KEY as string,
			aerodataboxRapidApiKey: options.env.AERODATABOX_RAPIDAPI_KEY as string,
		},
		fetchImpl: options.fetchImpl,
		generatedAt: options.generatedAt,
		nowMs: options.nowMs,
		onProgress: options.onProgress,
		sleep: options.sleep,
	});
	return {
		exitCode: payload.providers.aerodatabox.status === "passing" ? 0 : 1,
		payload,
	};
}
