import {
	type JourneyRecommendationRequest,
	type JourneyRecommendationResult,
	listPublishedTransferCatalog,
} from "@repo/data-ops/journey";
import type { DiagnosticContext, ProviderResult, TransitProvider } from "../providers";
import { recommendJourneys } from "./engine";

type JourneyDatabase = Parameters<typeof listPublishedTransferCatalog>[0];

/**
 * One structured line per transit-provider fault so the cause is findable in Worker logs.
 * Only the normalized status, field paths, and correlation reference are logged — never
 * coordinates, place text, or payloads.
 */
function logTransitFault(
	result: ProviderResult<unknown, unknown>,
	diagnostics: DiagnosticContext | undefined,
): void {
	if (result.status === "success" || result.status === "zero_result") return;
	// biome-ignore lint/suspicious/noConsole: structured fault line for Worker observability
	console.warn(
		JSON.stringify({
			event: "transit_provider_fault",
			status: result.status,
			reference: diagnostics?.reference ?? null,
			...(result.status === "incomplete_response" ? { missingFields: result.missingFields } : {}),
		}),
	);
}

function observedTransit(
	transit: TransitProvider,
	diagnostics: DiagnosticContext | undefined,
): TransitProvider {
	return {
		route: async (input) => {
			const result = await transit.route(input);
			logTransitFault(result, diagnostics);
			return result;
		},
	};
}

export function createJourneyService(
	transit: TransitProvider,
	db: JourneyDatabase,
	options: { now?: () => Date; freshnessDays?: number; diagnostics?: DiagnosticContext } = {},
): {
	recommend(input: JourneyRecommendationRequest): Promise<JourneyRecommendationResult>;
} {
	return {
		recommend: (input) => {
			const requestNow = options.now?.() ?? new Date();
			return recommendJourneys(input, {
				transit: observedTransit(transit, options.diagnostics),
				catalog: {
					listPublished: () =>
						listPublishedTransferCatalog(db, {
							now: requestNow,
							freshnessDays: options.freshnessDays,
						}),
				},
				now: () => requestNow,
				freshnessDays: options.freshnessDays,
				diagnostics: options.diagnostics,
			});
		},
	};
}
