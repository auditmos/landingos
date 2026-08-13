import {
	type JourneyRecommendationRequest,
	type JourneyRecommendationResult,
	listPublishedTransferCatalog,
} from "@repo/data-ops/journey";
import type { DiagnosticContext, TransitProvider } from "../providers";
import { recommendJourneys } from "./engine";

type JourneyDatabase = Parameters<typeof listPublishedTransferCatalog>[0];

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
				transit,
				catalog: {
					listPublished: () =>
						listPublishedTransferCatalog(db, {
							now: requestNow,
							freshnessDays: options.freshnessDays,
						}),
				},
				now: () => requestNow,
				freshnessDays: options.freshnessDays,
			});
		},
	};
}
