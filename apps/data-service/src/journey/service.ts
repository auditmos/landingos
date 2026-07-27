import {
	type JourneyRecommendationRequest,
	type JourneyRecommendationResult,
	listPublishedTransferCatalog,
} from "@repo/data-ops/journey";
import type { TransitProvider } from "../providers";
import { recommendJourneys } from "./engine";

type JourneyDatabase = Parameters<typeof listPublishedTransferCatalog>[0];

export function createJourneyService(
	transit: TransitProvider,
	db: JourneyDatabase,
): {
	recommend(input: JourneyRecommendationRequest): Promise<JourneyRecommendationResult>;
} {
	return {
		recommend: (input) =>
			recommendJourneys(input, {
				transit,
				catalog: { listPublished: () => listPublishedTransferCatalog(db) },
			}),
	};
}
