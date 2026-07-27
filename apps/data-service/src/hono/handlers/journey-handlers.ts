import { getDb } from "@repo/data-ops/database/setup";
import {
	type JourneyRecommendationRequest,
	JourneyRecommendationRequestSchema,
	type JourneyRecommendationResult,
	type JourneyVariant,
} from "@repo/data-ops/journey";
import { Hono } from "hono";
import { createJourneyService } from "../../journey/service";
import { resolveCatalogFreshnessDays } from "../../operator/catalog-service";
import {
	createFixtureProviderAdapters,
	createLiveProviderAdapters,
	resolveProviderConfig,
	type TransitProvider,
} from "../../providers";

export interface JourneyHandlerOperations {
	recommend(input: JourneyRecommendationRequest): Promise<JourneyRecommendationResult>;
}

export type JourneyOperationsFactory = (env: Env) => JourneyHandlerOperations;

function unavailableTransit(): TransitProvider {
	return {
		route: async () => ({
			status: "provider_error",
			httpStatus: 503,
			retryable: true,
		}),
	};
}

function defaultOperations(env: Env): JourneyHandlerOperations {
	const config = resolveProviderConfig(env as unknown as Record<string, string | undefined>);
	let transit = unavailableTransit();
	if (config.ok && config.config.mode === "fixture") {
		transit = createFixtureProviderAdapters().transit;
	} else if (config.ok && config.config.mode === "live") {
		transit = createLiveProviderAdapters(config.config.credentials, (input, init) =>
			fetch(input, init),
		).transit;
	}
	return createJourneyService(transit, getDb(), {
		freshnessDays: resolveCatalogFreshnessDays(env),
	});
}

function publicVariant(variant: JourneyVariant): JourneyVariant {
	return {
		id: variant.id,
		badges: [...variant.badges],
		durationMinutes: variant.durationMinutes,
		arrivalTimeUtc: variant.arrivalTimeUtc,
		cost: {
			currency: "EUR",
			minorMin: variant.cost.minorMin,
			minorMax: variant.cost.minorMax,
			completeness: variant.cost.completeness,
		},
		transferCount: variant.transferCount,
		walkingMinutes: variant.walkingMinutes,
		walkingMeters: variant.walkingMeters,
		steps: variant.steps.map((step) => ({
			mode: step.mode,
			from: step.from,
			to: step.to,
			durationMinutes: step.durationMinutes,
			walkingMeters: step.walkingMeters,
		})),
		sourceReferences: variant.sourceReferences.map((source) => ({
			kind: source.kind,
			label: source.label,
			url: source.url,
			checkedAt: source.checkedAt,
		})),
		manualVerification:
			variant.manualVerification === null
				? null
				: {
						checkedAt: variant.manualVerification.checkedAt,
						freshness: variant.manualVerification.freshness,
					},
		externalLinks: variant.externalLinks.map((link) => ({
			kind: link.kind,
			label: link.label,
			url: link.url,
		})),
	};
}

function publicResult(result: JourneyRecommendationResult): JourneyRecommendationResult {
	if (result.status === "recommendations") {
		return {
			status: result.status,
			variants: result.variants.map(publicVariant),
			explanation: result.explanation,
		};
	}
	if (result.status === "no_trustworthy_route") {
		return {
			status: result.status,
			reason: result.reason,
			manualAlternatives: result.manualAlternatives.map((link) => ({
				kind: link.kind,
				label: link.label,
				url: link.url,
			})),
		};
	}
	return {
		status: result.status,
		reason: result.reason,
		manualAlternatives: result.manualAlternatives.map((link) => ({
			kind: link.kind,
			label: link.label,
			url: link.url,
		})),
	};
}

export function createJourneyHandlers(
	operationsFactory: JourneyOperationsFactory = defaultOperations,
) {
	const journeys = new Hono<{ Bindings: Env }>();
	journeys.post("/recommend", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const parsed = JourneyRecommendationRequestSchema.safeParse(body);
		if (!parsed.success) {
			return c.json(
				{
					status: "validation_error" as const,
					fieldErrors: parsed.error.flatten().fieldErrors,
				},
				400,
			);
		}
		return c.json(publicResult(await operationsFactory(c.env).recommend(parsed.data)));
	});
	return journeys;
}

export default createJourneyHandlers();
