import {
	type JourneyCost,
	type JourneyExternalLink,
	type JourneyRecommendationRequest,
	JourneyRecommendationRequestSchema,
	type JourneyRecommendationResult,
	type JourneySourceReference,
	type JourneyStep,
	type JourneyVariant,
	sanitizeJourneyExternalUrl,
	type TransferCatalogEntry,
} from "@repo/data-ops/journey";
import type { ProviderResult, TransitProvider, TransitRoute } from "../providers";

const BGY_COORDINATES = { latitude: 45.6739, longitude: 9.7042 };
const DEFAULT_FRESHNESS_DAYS = 30;
const BADGE_ORDER = ["recommended", "fastest", "simplest"] as const;

export interface TransferCatalogRepository {
	listPublished(): Promise<TransferCatalogEntry[]>;
}

interface EngineDependencies {
	transit: TransitProvider;
	catalog: TransferCatalogRepository;
	now?: () => Date;
	freshnessDays?: number;
}

interface Candidate extends Omit<JourneyVariant, "id" | "badges"> {
	key: string;
	informationRank: number;
}

function addMinutes(instant: string, minutes: number): string {
	return new Date(new Date(instant).getTime() + minutes * 60_000).toISOString();
}

function normalizedSteps(route: TransitRoute): JourneyStep[] {
	return route.legs.map((leg) => ({
		mode: leg.mode,
		from: leg.from,
		to: leg.to,
		durationMinutes: leg.durationMinutes,
		walkingMeters: leg.walkingMeters,
	}));
}

function routeCost(route: TransitRoute): JourneyCost {
	const amount = route.fare.amountMinor;
	if (route.fare.completeness === "unknown" || amount === null) {
		return {
			currency: "EUR",
			minorMin: null,
			minorMax: null,
			completeness: "unknown",
		};
	}
	return {
		currency: "EUR",
		minorMin: amount,
		minorMax: route.fare.completeness === "complete" ? amount : null,
		completeness: route.fare.completeness,
	};
}

function providerSourceLabel(route: TransitRoute): string {
	return route.source.kind === "fixture" ? "Dane testowe LandingOS" : "Dostawca tras";
}

function candidateKey(candidate: {
	durationMinutes: number;
	arrivalTimeUtc: string;
	transferCount: number;
	walkingMinutes: number;
	walkingMeters: number;
	steps: JourneyStep[];
}): string {
	return JSON.stringify({
		durationMinutes: candidate.durationMinutes,
		arrivalTimeUtc: candidate.arrivalTimeUtc,
		transferCount: candidate.transferCount,
		walkingMinutes: candidate.walkingMinutes,
		walkingMeters: candidate.walkingMeters,
		steps: candidate.steps,
	});
}

function catalogMatchesRoute(entry: TransferCatalogEntry, route: TransitRoute): boolean {
	const stop = entry.destinationStopName.toLocaleLowerCase("it");
	return (
		entry.originIata === "BGY" &&
		route.legs.some(
			(leg) =>
				leg.from.toLocaleLowerCase("it").includes("bgy") && leg.to.toLocaleLowerCase("it") === stop,
		)
	);
}

function freshness(checkedAt: string, now: Date, freshnessDays: number): "fresh" | "stale" {
	const ageMs = now.getTime() - new Date(checkedAt).getTime();
	return ageMs <= freshnessDays * 24 * 60 * 60 * 1_000 ? "fresh" : "stale";
}

function uniqueSources(sources: JourneySourceReference[]): JourneySourceReference[] {
	const byKey = new Map<string, JourneySourceReference>();
	for (const source of sources) {
		byKey.set(JSON.stringify(source), source);
	}
	return [...byKey.values()].sort((left, right) =>
		`${left.kind}:${left.label}`.localeCompare(`${right.kind}:${right.label}`),
	);
}

function uniqueLinks(links: JourneyExternalLink[]): JourneyExternalLink[] {
	const byUrl = new Map<string, JourneyExternalLink>();
	for (const link of links) byUrl.set(link.url, link);
	return [...byUrl.values()].sort((left, right) => left.url.localeCompare(right.url));
}

function informationRank(candidate: {
	cost: JourneyCost;
	manualVerification: Candidate["manualVerification"];
}): number {
	const stale = candidate.manualVerification?.freshness === "stale";
	if (candidate.cost.completeness === "complete") return stale ? 1 : 0;
	if (candidate.cost.completeness === "partial") return stale ? 3 : 2;
	return 4;
}

function normalizeRoute(
	route: TransitRoute,
	catalogEntries: TransferCatalogEntry[],
	now: Date,
	freshnessDays: number,
): Candidate {
	const matchingEntries = catalogEntries
		.filter((entry) => catalogMatchesRoute(entry, route))
		.sort((left, right) => left.id.localeCompare(right.id));
	let cost = routeCost(route);
	let manualVerification: Candidate["manualVerification"] = null;
	const sourceReferences: JourneySourceReference[] = [
		{
			kind: "provider",
			label: providerSourceLabel(route),
			url: null,
			checkedAt: null,
		},
	];
	const externalLinks: JourneyExternalLink[] = [];
	for (const entry of matchingEntries) {
		const sourceUrl = sanitizeJourneyExternalUrl(entry.sourceUrl);
		const purchaseUrl = sanitizeJourneyExternalUrl(entry.purchaseUrl);
		sourceReferences.push({
			kind: "catalog",
			label: entry.operatorName,
			url: sourceUrl,
			checkedAt: entry.checkedAt,
		});
		if (purchaseUrl) {
			externalLinks.push({
				kind: "purchase",
				label: `Sprawdź u ${entry.operatorName}`,
				url: purchaseUrl,
			});
		}
		const entryFreshness = freshness(entry.checkedAt, now, freshnessDays);
		if (
			manualVerification === null ||
			new Date(entry.checkedAt) > new Date(manualVerification.checkedAt)
		) {
			manualVerification = {
				checkedAt: entry.checkedAt,
				freshness: entryFreshness,
			};
		}
		if (cost.completeness === "unknown") {
			cost = {
				currency: "EUR",
				minorMin: entry.costMinorMin,
				minorMax: entry.costMinorMax,
				completeness: "partial",
			};
		}
	}
	const steps = normalizedSteps(route);
	const base = {
		durationMinutes: route.durationMinutes,
		arrivalTimeUtc: new Date(route.arrivalTime).toISOString(),
		cost,
		transferCount: route.transfers,
		walkingMinutes: route.walkingMinutes,
		walkingMeters: route.walkingMeters,
		steps,
		sourceReferences: uniqueSources(sourceReferences),
		manualVerification,
		externalLinks: uniqueLinks(externalLinks),
	};
	return {
		...base,
		key: candidateKey(base),
		informationRank: informationRank(base),
	};
}

function mergeDuplicate(left: Candidate, right: Candidate): Candidate {
	const manualVerification =
		left.manualVerification === null
			? right.manualVerification
			: right.manualVerification === null
				? left.manualVerification
				: new Date(left.manualVerification.checkedAt) >=
						new Date(right.manualVerification.checkedAt)
					? left.manualVerification
					: right.manualVerification;
	const cost = informationRank(left) <= informationRank(right) ? left.cost : right.cost;
	const merged = {
		...left,
		cost,
		manualVerification,
		sourceReferences: uniqueSources([...left.sourceReferences, ...right.sourceReferences]),
		externalLinks: uniqueLinks([...left.externalLinks, ...right.externalLinks]),
	};
	return { ...merged, informationRank: informationRank(merged) };
}

function deduplicate(candidates: Candidate[]): Candidate[] {
	const byKey = new Map<string, Candidate>();
	for (const candidate of candidates) {
		const existing = byKey.get(candidate.key);
		byKey.set(candidate.key, existing ? mergeDuplicate(existing, candidate) : candidate);
	}
	return [...byKey.values()];
}

function compareKey(left: Candidate, right: Candidate): number {
	return left.key.localeCompare(right.key);
}

function fastest(left: Candidate, right: Candidate): number {
	return (
		left.durationMinutes - right.durationMinutes ||
		left.transferCount - right.transferCount ||
		left.walkingMinutes - right.walkingMinutes ||
		compareKey(left, right)
	);
}

function simplest(left: Candidate, right: Candidate): number {
	return (
		left.transferCount - right.transferCount ||
		left.walkingMinutes - right.walkingMinutes ||
		left.durationMinutes - right.durationMinutes ||
		compareKey(left, right)
	);
}

function recommended(left: Candidate, right: Candidate): number {
	return (
		left.informationRank - right.informationRank ||
		left.transferCount - right.transferCount ||
		left.durationMinutes - right.durationMinutes ||
		left.walkingMinutes - right.walkingMinutes ||
		compareKey(left, right)
	);
}

function rank(candidates: Candidate[]): JourneyVariant[] {
	const badgeMap = new Map<string, Set<(typeof BADGE_ORDER)[number]>>();
	const winners = [
		["recommended", [...candidates].sort(recommended)[0]],
		["fastest", [...candidates].sort(fastest)[0]],
		["simplest", [...candidates].sort(simplest)[0]],
	] as const;
	const selectedKeys: string[] = [];
	for (const [badge, candidate] of winners) {
		if (!candidate) continue;
		if (!selectedKeys.includes(candidate.key)) selectedKeys.push(candidate.key);
		const badges = badgeMap.get(candidate.key) ?? new Set();
		badges.add(badge);
		badgeMap.set(candidate.key, badges);
	}
	for (const candidate of [...candidates].sort(recommended)) {
		if (selectedKeys.length >= 3) break;
		if (!selectedKeys.includes(candidate.key)) selectedKeys.push(candidate.key);
	}
	return selectedKeys.map((key, index) => {
		const candidate = candidates.find((item) => item.key === key) as Candidate;
		const { informationRank: _rank, key: _key, ...variant } = candidate;
		return {
			id: `journey-${index + 1}`,
			badges: BADGE_ORDER.filter((badge) => badgeMap.get(key)?.has(badge)),
			...variant,
		};
	});
}

function manualAlternatives(entries: TransferCatalogEntry[]): JourneyExternalLink[] {
	return uniqueLinks(
		entries.flatMap((entry) => {
			const url = sanitizeJourneyExternalUrl(entry.purchaseUrl);
			return url
				? [{ kind: "purchase" as const, label: `Sprawdź u ${entry.operatorName}`, url }]
				: [];
		}),
	);
}

function providerFailure(
	result: Exclude<ProviderResult<TransitRoute[], TransitRoute>, { status: "success" }>,
	entries: TransferCatalogEntry[],
): JourneyRecommendationResult {
	const alternatives = manualAlternatives(entries);
	if (result.status === "zero_result") {
		return {
			status: "no_trustworthy_route",
			reason: "zero_result",
			manualAlternatives: alternatives,
		};
	}
	if (result.status === "timeout" || result.status === "rate_limited") {
		return {
			status: "recommendation_unavailable",
			reason: result.status,
			manualAlternatives: alternatives,
		};
	}
	if (result.status === "provider_error") {
		return {
			status: "recommendation_unavailable",
			reason: "provider_error",
			manualAlternatives: alternatives,
		};
	}
	return {
		status: "recommendation_unavailable",
		reason: "incomplete",
		manualAlternatives: alternatives,
	};
}

export async function recommendJourneys(
	rawRequest: JourneyRecommendationRequest,
	dependencies: EngineDependencies,
): Promise<JourneyRecommendationResult> {
	const input = JourneyRecommendationRequestSchema.parse(rawRequest);
	const departureTime = addMinutes(input.scheduledArrivalUtc, input.bufferMinutes);
	const [providerResult, catalogEntries] = await Promise.all([
		dependencies.transit.route({
			origin: BGY_COORDINATES,
			destination: input.privateDestinationCoordinates,
			departureTime,
		}),
		dependencies.catalog.listPublished(),
	]);
	if (providerResult.status !== "success") {
		return providerFailure(providerResult, catalogEntries);
	}
	const postArrivalRoutes = providerResult.value.filter(
		(route) => new Date(route.departureTime).getTime() >= new Date(departureTime).getTime(),
	);
	if (postArrivalRoutes.length === 0) {
		return {
			status: "no_trustworthy_route",
			reason: "no_post_arrival_route",
			manualAlternatives: manualAlternatives(catalogEntries),
		};
	}
	const now = dependencies.now?.() ?? new Date();
	const candidates = deduplicate(
		postArrivalRoutes.map((route) =>
			normalizeRoute(
				route,
				catalogEntries,
				now,
				dependencies.freshnessDays ?? DEFAULT_FRESHNESS_DAYS,
			),
		),
	);
	if (candidates.length === 0) {
		return {
			status: "no_trustworthy_route",
			reason: "no_complete_itinerary",
			manualAlternatives: manualAlternatives(catalogEntries),
		};
	}
	const variants = rank(candidates);
	const explanation =
		variants.length >= 3
			? null
			: variants.length === 1
				? "Znaleźliśmy tylko jedną unikalną i wiarygodną trasę."
				: "Znaleźliśmy tylko dwie unikalne i wiarygodne trasy.";
	return { status: "recommendations", variants, explanation };
}
