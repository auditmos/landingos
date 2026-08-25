import { getDb } from "@repo/data-ops/database/setup";
import {
	type CatalogTransferAlternative,
	CatalogTransferAlternativeSchema,
	type JourneyExternalLink,
	type JourneyRecommendationRequest,
	JourneyRecommendationRequestSchema,
	type JourneyRecommendationResult,
	type JourneyVariant,
} from "@repo/data-ops/journey";
import { Hono } from "hono";
import { createDatabaseAnalyticsTracker } from "../../analytics/repository";
import {
	ANALYTICS_FUNNEL_HEADER,
	type AnalyticsTracker,
	readRequestedFunnelId,
} from "../../analytics/service";
import { createJourneyService } from "../../journey/service";
import { resolveCatalogFreshnessDays } from "../../operator/catalog-service";
import { type DiagnosticContext, resolveProviderAdapters } from "../../providers";
import { publicDiagnostic, requestDiagnosticContext } from "../utils/diagnostics-context";

export interface JourneyHandlerOperations {
	recommend(input: JourneyRecommendationRequest): Promise<JourneyRecommendationResult>;
}

export type JourneyOperationsFactory = (
	env: Env,
	diagnostics: DiagnosticContext,
) => JourneyHandlerOperations;
export type JourneyAnalyticsFactory = (env: Env) => AnalyticsTracker;

function defaultOperations(env: Env, diagnostics: DiagnosticContext): JourneyHandlerOperations {
	return createJourneyService(resolveProviderAdapters(env).transit, getDb(), {
		freshnessDays: resolveCatalogFreshnessDays(env),
		diagnostics,
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

function publicLink(link: JourneyExternalLink): JourneyExternalLink {
	return { kind: link.kind, label: link.label, url: link.url };
}

// Re-parsed against the strict schema so a catalog alternative can only ever carry
// the allowlisted, operator-entered transfer facts.
function publicCatalogAlternative(
	alternative: CatalogTransferAlternative,
): CatalogTransferAlternative {
	return CatalogTransferAlternativeSchema.parse(alternative);
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
			manualAlternatives: result.manualAlternatives.map(publicLink),
			catalogAlternatives: result.catalogAlternatives.map(publicCatalogAlternative),
			...publicDiagnostic(result.diagnostic),
		};
	}
	return {
		status: result.status,
		reason: result.reason,
		manualAlternatives: result.manualAlternatives.map(publicLink),
		catalogAlternatives: result.catalogAlternatives.map(publicCatalogAlternative),
		...publicDiagnostic(result.diagnostic),
	};
}

export function createJourneyHandlers(
	operationsFactory: JourneyOperationsFactory = defaultOperations,
	analyticsFactory: JourneyAnalyticsFactory = createDatabaseAnalyticsTracker,
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
		const result = await operationsFactory(c.env, requestDiagnosticContext(c, "trasa")).recommend(
			parsed.data,
		);
		if (result.status === "recommendations") {
			const funnelId = await analyticsFactory(c.env).track(readRequestedFunnelId(c.req.raw), {
				eventName: "recommendations_viewed",
			});
			c.header(ANALYTICS_FUNNEL_HEADER, funnelId);
		}
		return c.json(publicResult(result));
	});
	return journeys;
}

export default createJourneyHandlers();
