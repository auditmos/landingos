import {
	type CatalogTransferAlternative,
	type JourneyCost,
	type JourneyExternalLink,
	type JourneyRecommendationRequest,
	JourneyRecommendationRequestSchema,
	type JourneyRecommendationResult,
	type JourneySourceReference,
	type JourneyStep,
	type JourneyVariant,
	type PublishedTransferCatalogEntry,
	sanitizeJourneyExternalUrl,
} from "@repo/data-ops/journey";
import {
	BGY_ROUTE_ORIGIN,
	contextDiagnostic,
	type DiagnosticContext,
	type ProviderDiagnostic,
	type ProviderResult,
	type TransitProvider,
	type TransitRoute,
} from "../providers";

const BADGE_ORDER = ["recommended", "fastest", "simplest"] as const;

export interface TransferCatalogRepository {
	listPublished(): Promise<PublishedTransferCatalogEntry[]>;
}

interface EngineDependencies {
	transit: TransitProvider;
	catalog: TransferCatalogRepository;
	diagnostics?: DiagnosticContext;
}

/** `key` is the dedup identity and the final deterministic tie-break; nothing derived is cached. */
interface Candidate extends Omit<JourneyVariant, "id" | "badges"> {
	key: string;
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

/**
 * Folds a stop label into a stable identity: diacritics, case, spacing, and separators
 * are provider-side noise, so "Milano  Centrale" and "milano-centrale" are one stop.
 */
function normalizeStopIdentity(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * `destinationStopCode` is the stable merge key. The normalized display name is a
 * documented fallback for providers that only expose a human label.
 *
 * Every route starts at BGY, so the first non-walk leg *is* the airport departure leg;
 * Google names that stop "Bergamo Airport Bus Station" or "Aeroporto Il Caravaggio",
 * never with the IATA code, so the match is structural rather than by origin name.
 */
function catalogMatchesRoute(entry: PublishedTransferCatalogEntry, route: TransitRoute): boolean {
	const identities = new Set([
		normalizeStopIdentity(entry.destinationStopCode),
		normalizeStopIdentity(entry.destinationStopName),
	]);
	const airportLeg = route.legs.find((leg) => leg.mode !== "walk");
	return (
		entry.originIata === "BGY" &&
		airportLeg !== undefined &&
		identities.has(normalizeStopIdentity(airportLeg.to))
	);
}

function catalogSourceLabel(entry: PublishedTransferCatalogEntry): string {
	return `${entry.operatorName} · ${entry.serviceName}`;
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
	catalogEntries: PublishedTransferCatalogEntry[],
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
			label: catalogSourceLabel(entry),
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
		if (
			manualVerification === null ||
			new Date(entry.checkedAt) > new Date(manualVerification.checkedAt)
		) {
			manualVerification = {
				checkedAt: entry.checkedAt,
				freshness: entry.freshness,
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
	return { ...base, key: candidateKey(base) };
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
	return {
		...left,
		cost,
		manualVerification,
		sourceReferences: uniqueSources([...left.sourceReferences, ...right.sourceReferences]),
		externalLinks: uniqueLinks([...left.externalLinks, ...right.externalLinks]),
	};
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
		informationRank(left) - informationRank(right) ||
		left.transferCount - right.transferCount ||
		left.durationMinutes - right.durationMinutes ||
		left.walkingMinutes - right.walkingMinutes ||
		compareKey(left, right)
	);
}

/**
 * Candidates are deduplicated before this runs, so each one is its own identity: a badge
 * belongs to the object that won it, and the card list is filled in `recommended` order.
 */
function rank(candidates: Candidate[]): JourneyVariant[] {
	const winners = {
		recommended: [...candidates].sort(recommended)[0],
		fastest: [...candidates].sort(fastest)[0],
		simplest: [...candidates].sort(simplest)[0],
	};
	const selected: Candidate[] = [];
	for (const badge of BADGE_ORDER) {
		const winner = winners[badge];
		if (winner && !selected.includes(winner)) selected.push(winner);
	}
	for (const candidate of [...candidates].sort(recommended)) {
		if (selected.length >= 3) break;
		if (!selected.includes(candidate)) selected.push(candidate);
	}
	return selected.map((candidate, index) => {
		const { key: _key, ...variant } = candidate;
		return {
			id: `journey-${index + 1}`,
			badges: BADGE_ORDER.filter((badge) => winners[badge] === candidate),
			...variant,
		};
	});
}

function purchaseLink(entry: PublishedTransferCatalogEntry): JourneyExternalLink | null {
	const url = sanitizeJourneyExternalUrl(entry.purchaseUrl);
	return url ? { kind: "purchase", label: `Sprawdź u ${entry.operatorName}`, url } : null;
}

/**
 * Renders a published entry as a standalone, manually verified BGY → stop transfer.
 * It carries no arrival time, no steps, and no badge, so it can never be read as an
 * end-to-end route to the traveler's private destination.
 */
function catalogAlternatives(
	entries: PublishedTransferCatalogEntry[],
): CatalogTransferAlternative[] {
	return entries.map((entry) => ({
		id: entry.id,
		kind: "manually_verified_transfer" as const,
		operatorName: entry.operatorName,
		serviceName: entry.serviceName,
		destinationStopCode: entry.destinationStopCode,
		destinationStopName: entry.destinationStopName,
		durationMinutes: entry.durationMinutes,
		transferCount: entry.transferCount,
		walkingMinutes: entry.walkingMinutes,
		walkingMeters: entry.walkingMeters,
		cost: {
			currency: "EUR" as const,
			minorMin: entry.costMinorMin,
			minorMax: entry.costMinorMax,
			completeness: "partial" as const,
		},
		source: {
			kind: "catalog" as const,
			label: catalogSourceLabel(entry),
			url: sanitizeJourneyExternalUrl(entry.sourceUrl),
			checkedAt: entry.checkedAt,
		},
		freshness: entry.freshness,
		purchaseLink: purchaseLink(entry),
	}));
}

function manualAlternatives(entries: PublishedTransferCatalogEntry[]): JourneyExternalLink[] {
	return uniqueLinks(entries.flatMap((entry) => purchaseLink(entry) ?? []));
}

/** The failure payload shared by every non-recommendation outcome. */
function fallbackPayload(entries: PublishedTransferCatalogEntry[]): {
	manualAlternatives: JourneyExternalLink[];
	catalogAlternatives: CatalogTransferAlternative[];
} {
	return {
		manualAlternatives: manualAlternatives(entries),
		catalogAlternatives: catalogAlternatives(entries),
	};
}

function providerFailure(
	result: Exclude<ProviderResult<TransitRoute[], TransitRoute>, { status: "success" }>,
	fallback: ReturnType<typeof fallbackPayload>,
	diagnostics: DiagnosticContext | undefined,
): JourneyRecommendationResult {
	const diagnostic = contextDiagnostic(diagnostics, result);
	const attached = diagnostic ? { diagnostic } : {};
	if (result.status === "zero_result") {
		return { status: "no_trustworthy_route", reason: "zero_result", ...fallback, ...attached };
	}
	if (result.status === "timeout" || result.status === "rate_limited") {
		return {
			status: "recommendation_unavailable",
			reason: result.status,
			...fallback,
			...attached,
		};
	}
	if (result.status === "provider_error") {
		return {
			status: "recommendation_unavailable",
			reason: "provider_error",
			...fallback,
			...attached,
		};
	}
	return { status: "recommendation_unavailable", reason: "incomplete", ...fallback, ...attached };
}

// A trustworthy-route dead end is a coverage outcome, not a transport fault: the
// provider answered, the answer just does not reach the traveler's destination.
function coverageDiagnostic(
	diagnostics: DiagnosticContext | undefined,
): { diagnostic: ProviderDiagnostic } | Record<string, never> {
	const diagnostic = contextDiagnostic(diagnostics, { status: "zero_result" });
	return diagnostic ? { diagnostic } : {};
}

export async function recommendJourneys(
	rawRequest: JourneyRecommendationRequest,
	dependencies: EngineDependencies,
): Promise<JourneyRecommendationResult> {
	const input = JourneyRecommendationRequestSchema.parse(rawRequest);
	const departureTime = addMinutes(input.scheduledArrivalUtc, input.bufferMinutes);
	const [providerResult, catalogEntries] = await Promise.all([
		dependencies.transit.route({
			origin: BGY_ROUTE_ORIGIN,
			destination: input.privateDestinationCoordinates,
			departureTime,
		}),
		dependencies.catalog.listPublished(),
	]);
	const fallback = fallbackPayload(catalogEntries);
	if (providerResult.status !== "success") {
		return providerFailure(providerResult, fallback, dependencies.diagnostics);
	}
	const postArrivalRoutes = providerResult.value.filter(
		(route) => new Date(route.departureTime).getTime() >= new Date(departureTime).getTime(),
	);
	if (postArrivalRoutes.length === 0) {
		return {
			status: "no_trustworthy_route",
			reason: "no_post_arrival_route",
			...fallback,
			...coverageDiagnostic(dependencies.diagnostics),
		};
	}
	const candidates = deduplicate(
		postArrivalRoutes.map((route) => normalizeRoute(route, catalogEntries)),
	);
	if (candidates.length === 0) {
		return {
			status: "no_trustworthy_route",
			reason: "no_complete_itinerary",
			...fallback,
			...coverageDiagnostic(dependencies.diagnostics),
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
