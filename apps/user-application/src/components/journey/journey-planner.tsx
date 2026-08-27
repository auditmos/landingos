import type { PrivateDestination } from "@repo/data-ops/destination";
import {
	canonicalFlightDesignator,
	type FlightInstance,
	formatFlightDesignator,
} from "@repo/data-ops/flight";
import type {
	CatalogTransferAlternative,
	JourneyRecommendationResult,
	JourneyVariant,
} from "@repo/data-ops/journey";
import {
	ChevronDown,
	Clock3,
	ExternalLink,
	Footprints,
	Navigation,
	RotateCcw,
	Route,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderFailureNotice } from "@/components/ui/provider-failure-notice";
import { formatDepartureDate } from "@/lib/flight-planner";
import {
	formatJourneyArrival,
	formatJourneyCost,
	formatWalkingDistance,
	journeyBadgeCopy,
	journeyFailureCopy,
	journeyNavigationUrl,
	journeyUnavailableFromError,
	recommendJourneysApi,
} from "@/lib/journey-planner";
import { savePrivateDropOff } from "@/lib/private-drop-off";
import { journeyOutcomeGuidance } from "@/lib/provider-diagnostics";
import { publicSelectionFromJourneyVariant, saveRoomIntent } from "@/lib/room-intent";
import { cn } from "@/lib/utils";

const modeCopy = {
	bus: "Autobus",
	train: "Pociąg",
	metro: "Metro",
	tram: "Tramwaj",
	walk: "Pieszo",
} as const;

function variantShortLabel(variant: JourneyVariant, index: number): string {
	const badge = variant.badges[0];
	return badge ? journeyBadgeCopy[badge] : `Wariant ${index + 1}`;
}

/**
 * The trailing "· dane nieaktualne, sprawdzono <data>" clause. `checkedAt` is genuinely
 * nullable, so the whole clause — not just the date — disappears for a source that was
 * never checked; otherwise the Polish copy trails off into the literal "Invalid Date".
 */
function sourceFreshnessCopy(checkedAt: string | null, freshness?: "fresh" | "stale"): string {
	const clause = [
		freshness === "stale" ? "dane nieaktualne" : "",
		checkedAt ? `sprawdzono ${new Date(checkedAt).toLocaleDateString("pl-PL")}` : "",
	]
		.filter(Boolean)
		.join(", ");
	return clause ? ` · ${clause}` : "";
}

function transferCountLabel(count: number): string {
	if (count === 1) return "1 przesiadka";
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} przesiadki`;
	return `${count} przesiadek`;
}

export function JourneyVariantCard({
	variant,
	mapsUrl,
	onChoose,
}: {
	variant: JourneyVariant;
	mapsUrl?: string | null;
	onChoose?: (variant: JourneyVariant) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap gap-2">
					{variant.badges.map((badge) => (
						<Badge key={badge} variant={badge === "recommended" ? "default" : "secondary"}>
							{journeyBadgeCopy[badge]}
						</Badge>
					))}
				</div>
				<CardTitle className="flex items-center gap-2 text-balance text-2xl tabular-nums">
					<Clock3 className="size-5" />
					{variant.durationMinutes} min
				</CardTitle>
				<CardDescription className="text-pretty tabular-nums">
					Przyjazd około {formatJourneyArrival(variant.arrivalTimeUtc)}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
					<div>
						<dt className="text-muted-foreground">Cena</dt>
						<dd className="font-semibold tabular-nums">{formatJourneyCost(variant.cost)}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Przesiadki</dt>
						<dd className="font-semibold tabular-nums">{variant.transferCount}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Pieszo</dt>
						<dd className="font-semibold tabular-nums">{variant.walkingMinutes} min</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Dystans pieszo</dt>
						<dd className="font-semibold tabular-nums">
							{formatWalkingDistance(variant.walkingMeters)}
						</dd>
					</div>
				</dl>

				{variant.manualVerification ? (
					<p
						className={cn(
							"text-pretty text-sm tabular-nums",
							variant.manualVerification.freshness === "stale"
								? "font-medium text-destructive"
								: "text-muted-foreground",
						)}
					>
						{variant.manualVerification.freshness === "stale"
							? "Dane ręczne są nieaktualne — sprawdź je u operatora."
							: `Dane ręczne zweryfikowano ${new Date(
									variant.manualVerification.checkedAt,
								).toLocaleDateString("pl-PL")}.`}
					</p>
				) : (
					<p className="text-pretty text-sm text-muted-foreground">
						Kompletność ceny:{" "}
						{variant.cost.completeness === "complete"
							? "pełna"
							: variant.cost.completeness === "partial"
								? "częściowa"
								: "nieznana"}
					</p>
				)}

				<div className="flex flex-wrap gap-2">
					{mapsUrl ? (
						<Button asChild>
							<a href={mapsUrl} target="_blank" rel="noopener noreferrer">
								<Navigation className="size-4" />
								Nawiguj w Mapach Google
								<ExternalLink className="size-4" />
							</a>
						</Button>
					) : null}
					{variant.externalLinks.map((link) => (
						<Button key={link.url} asChild variant="outline">
							<a href={link.url} target="_blank" rel="noopener noreferrer">
								{link.label}
								<ExternalLink className="size-4" />
							</a>
						</Button>
					))}
					{onChoose ? (
						<Button type="button" variant="secondary" onClick={() => onChoose(variant)}>
							<Users className="size-4" />
							Jadę tym wariantem — do pokoju
						</Button>
					) : null}
				</div>

				<details className="group rounded-md border border-border">
					<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
						Etapy trasy i źródła ({variant.steps.length})
						<ChevronDown
							className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
							aria-hidden="true"
						/>
					</summary>
					<div className="space-y-4 border-t border-border px-3 py-3">
						<ol className="space-y-2">
							{variant.steps.map((step, index) => (
								<li key={`${step.mode}:${step.from}:${step.to}:${index}`} className="text-sm">
									<p className="font-medium tabular-nums">
										{index + 1}. {modeCopy[step.mode]} · {step.durationMinutes} min
									</p>
									<p className="text-pretty text-muted-foreground">
										{step.from} → {step.to}
										{step.walkingMeters > 0 ? (
											<span className="tabular-nums">
												{" "}
												· <Footprints className="mr-0.5 inline size-3" aria-hidden="true" />
												{formatWalkingDistance(step.walkingMeters)} pieszo
											</span>
										) : null}
									</p>
								</li>
							))}
						</ol>
						<div className="text-sm tabular-nums">
							<p className="font-medium">Źródła</p>
							<ul className="text-muted-foreground">
								{variant.sourceReferences.map((source) => (
									<li key={`${source.kind}:${source.label}`}>
										{source.label}
										{sourceFreshnessCopy(source.checkedAt)}
									</li>
								))}
							</ul>
						</div>
					</div>
				</details>
			</CardContent>
		</Card>
	);
}

function JourneyVariantPicker({
	variants,
	selectedId,
	onSelect,
}: {
	variants: JourneyVariant[];
	selectedId: string;
	onSelect: (id: string) => void;
}) {
	if (variants.length < 2) return null;
	return (
		<fieldset className="border-0 p-0">
			<legend className="sr-only">Wybór wariantu przejazdu</legend>
			<div className="grid gap-2 sm:grid-cols-3">
				{variants.map((variant, index) => {
					const isSelected = variant.id === selectedId;
					return (
						<button
							key={variant.id}
							type="button"
							aria-pressed={isSelected}
							onClick={() => onSelect(variant.id)}
							className={cn(
								"min-h-11 rounded-md border px-4 py-3 text-left transition-colors",
								isSelected
									? "border-primary bg-accent text-accent-foreground"
									: "border-border bg-card hover:bg-muted",
							)}
						>
							<span
								className={cn(
									"block text-xs font-bold uppercase",
									isSelected ? "text-accent-foreground" : "text-primary",
								)}
							>
								{variantShortLabel(variant, index)}
							</span>
							<span className="mt-1 block text-xl font-bold tabular-nums">
								{variant.durationMinutes} min
							</span>
							<span
								className={cn(
									"block text-xs tabular-nums",
									isSelected ? "text-accent-foreground" : "text-muted-foreground",
								)}
							>
								{transferCountLabel(variant.transferCount)} · {variant.walkingMinutes} min pieszo
							</span>
						</button>
					);
				})}
			</div>
		</fieldset>
	);
}

/**
 * A published catalog entry shown on its own. It deliberately carries no arrival time,
 * no badge, and no step list, and says in Polish that it stops at a BGY transfer stop
 * rather than at the traveler's address.
 */
function CatalogTransferAlternativeCard({
	alternative,
}: {
	alternative: CatalogTransferAlternative;
}) {
	return (
		<Card>
			<CardHeader>
				<Badge variant="secondary">Ręcznie zweryfikowany przejazd z BGY</Badge>
				<CardTitle className="text-balance text-lg">
					{alternative.operatorName} · {alternative.serviceName}
				</CardTitle>
				<CardDescription className="text-pretty">
					Dojazd na przystanek {alternative.destinationStopName}. To nie jest trasa pod Twój adres —
					dalszą część drogi zaplanuj samodzielnie.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
					<div>
						<dt className="text-muted-foreground">Czas przejazdu</dt>
						<dd className="font-semibold tabular-nums">{alternative.durationMinutes} min</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Przesiadki</dt>
						<dd className="font-semibold tabular-nums">{alternative.transferCount}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Pieszo</dt>
						<dd className="font-semibold tabular-nums">{alternative.walkingMinutes} min</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Dystans pieszo</dt>
						<dd className="font-semibold tabular-nums">
							{formatWalkingDistance(alternative.walkingMeters)}
						</dd>
					</div>
				</dl>
				<p className="text-pretty text-sm tabular-nums">
					Cena: {formatJourneyCost(alternative.cost)} · {alternative.source.label}
					{sourceFreshnessCopy(alternative.source.checkedAt, alternative.freshness)}
				</p>
				<div className="flex flex-wrap gap-2">
					{alternative.source.url ? (
						<Button asChild variant="outline" size="sm">
							<a href={alternative.source.url} target="_blank" rel="noopener noreferrer">
								Źródło informacji
								<ExternalLink className="size-4" />
							</a>
						</Button>
					) : null}
					{alternative.purchaseLink ? (
						<Button asChild variant="outline" size="sm">
							<a href={alternative.purchaseLink.url} target="_blank" rel="noopener noreferrer">
								{alternative.purchaseLink.label}
								<ExternalLink className="size-4" />
							</a>
						</Button>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}

function JourneyFailure({
	result,
	onRetry,
	onChangeParameters,
}: {
	result: Exclude<JourneyRecommendationResult, { status: "recommendations" }>;
	onRetry: () => void;
	onChangeParameters: () => void;
}) {
	// A catalog card already carries its own purchase link, so the bare link list keeps
	// only the alternatives that no card covers.
	const cardUrls = new Set(
		result.catalogAlternatives.flatMap((alternative) =>
			alternative.purchaseLink ? [alternative.purchaseLink.url] : [],
		),
	);
	const uncoveredLinks = result.manualAlternatives.filter((link) => !cardUrls.has(link.url));
	return (
		<>
			<Alert variant="destructive">
				<AlertTitle className="text-balance">Nie udało się przygotować rekomendacji</AlertTitle>
				<AlertDescription>
					<ProviderFailureNotice
						message={journeyFailureCopy[result.reason]}
						guidance={journeyOutcomeGuidance[result.reason]}
						diagnostic={result.diagnostic}
					/>
					<div className="mt-3 flex flex-wrap gap-2">
						<Button type="button" size="sm" variant="outline" onClick={onRetry}>
							<RotateCcw className="size-4" />
							Spróbuj ponownie
						</Button>
						<Button type="button" size="sm" variant="outline" onClick={onChangeParameters}>
							Zmień parametry
						</Button>
					</div>
					{uncoveredLinks.length > 0 ? (
						<div className="mt-3">
							<p>Alternatywy ręczne:</p>
							{uncoveredLinks.map((link) => (
								<a
									key={link.url}
									className="block underline"
									href={link.url}
									target="_blank"
									rel="noopener noreferrer"
								>
									{link.label}
								</a>
							))}
						</div>
					) : null}
				</AlertDescription>
			</Alert>
			{result.catalogAlternatives.map((alternative) => (
				<CatalogTransferAlternativeCard key={alternative.id} alternative={alternative} />
			))}
		</>
	);
}

export function JourneyPlanner({
	flight,
	destination,
}: {
	flight: FlightInstance;
	destination: PrivateDestination;
}) {
	const [bufferMinutes, setBufferMinutes] = useState(45);
	const departureFromAirportUtc = new Date(
		new Date(flight.scheduledArrivalUtc).getTime() + bufferMinutes * 60_000,
	).toISOString();
	const [retryKey, setRetryKey] = useState(0);
	const [result, setResult] = useState<JourneyRecommendationResult>();
	const [loading, setLoading] = useState(false);
	const [selectedVariantId, setSelectedVariantId] = useState<string>();
	const { latitude, longitude } = destination.coordinates;
	const mapsUrl = journeyNavigationUrl(destination.coordinates);

	const variants = result?.status === "recommendations" ? result.variants : [];
	// Response-local IDs change on every refetch — fall back to the recommended
	// (or first) variant whenever the stored selection no longer exists.
	const selectedVariant =
		variants.find((variant) => variant.id === selectedVariantId) ??
		variants.find((variant) => variant.badges.includes("recommended")) ??
		variants[0];

	function continueToRoom(variant: JourneyVariant) {
		const selection = publicSelectionFromJourneyVariant(variant);
		saveRoomIntent({ flightInstanceId: flight.id, selection, publicOption: selection });
		rememberDropOff();
		window.location.assign("/app");
	}

	// Keep the traveler's own destination label and the planner's exact
	// navigation link available in the room view (browser-local only; the
	// label is shared with the room solely via the explicit toggle, the
	// link never).
	function rememberDropOff() {
		savePrivateDropOff({
			flightInstanceId: flight.id,
			label: destination.displayName.trim().slice(0, 120),
			...(mapsUrl ? { mapsUrl } : {}),
		});
	}

	useEffect(() => {
		void retryKey;
		const controller = new AbortController();
		setLoading(true);
		setResult(undefined);
		recommendJourneysApi(
			{
				flightInstanceId: flight.id,
				scheduledArrivalUtc: flight.scheduledArrivalUtc,
				privateDestinationCoordinates: { latitude, longitude },
				bufferMinutes,
			},
			controller.signal,
		)
			.then((next) => {
				if (!controller.signal.aborted) setResult(next);
			})
			.catch((caught) => {
				if (!controller.signal.aborted) {
					setResult(journeyUnavailableFromError(caught));
				}
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});
		return () => controller.abort();
	}, [bufferMinutes, flight.id, flight.scheduledArrivalUtc, latitude, longitude, retryKey]);

	return (
		<section className="space-y-4">
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<Route className="size-5 text-primary" />
						<CardTitle className="text-balance">Warianty przejazdu</CardTitle>
					</div>
					<CardDescription className="text-pretty">
						Czas na wyjście z lotniska doliczamy do planowanego lądowania — tak liczymy, o której
						ruszysz z lotniska i o której dojedziesz.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<label className="text-sm font-medium tabular-nums" htmlFor="journey-buffer">
						Czas na wyjście z lotniska (bagaż, kawa): {bufferMinutes} min
					</label>
					<input
						id="journey-buffer"
						className="mt-2 block w-full"
						type="range"
						min={15}
						max={180}
						step={5}
						value={bufferMinutes}
						aria-valuetext={`${bufferMinutes} minut`}
						onChange={(event) => setBufferMinutes(Number(event.target.value))}
					/>
					<p className="mt-1 text-pretty text-xs text-muted-foreground tabular-nums">
						Ruszasz z lotniska ok. {formatJourneyArrival(departureFromAirportUtc)}. Zakres 15–180
						min, krok 5 min.
					</p>
				</CardContent>
			</Card>

			{loading ? (
				<Card aria-live="polite" aria-busy="true">
					<CardContent className="space-y-3 py-5">
						<p className="text-pretty font-medium">Przygotowujemy warianty przejazdu…</p>
						<div className="h-4 w-3/4 rounded bg-muted" aria-hidden="true" />
						<div className="h-4 w-1/2 rounded bg-muted" aria-hidden="true" />
					</CardContent>
				</Card>
			) : null}
			{result?.status === "recommendations" && selectedVariant ? (
				<>
					{result.explanation ? (
						<Alert>
							<AlertDescription>{result.explanation}</AlertDescription>
						</Alert>
					) : null}
					<Alert>
						<AlertTitle>Potwierdzenie pokoju lotu</AlertTitle>
						<AlertDescription>
							Dołączasz do pokoju {formatFlightDesignator(canonicalFlightDesignator(flight))} ·{" "}
							{formatDepartureDate(flight.departureLocalDate)}
						</AlertDescription>
					</Alert>
					<JourneyVariantPicker
						variants={variants}
						selectedId={selectedVariant.id}
						onSelect={setSelectedVariantId}
					/>
					<JourneyVariantCard
						key={selectedVariant.id}
						variant={selectedVariant}
						mapsUrl={mapsUrl}
						onChoose={continueToRoom}
					/>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-balance text-xl">
								<Users className="size-5" />
								Szukasz osób do dzielonej taksówki?
							</CardTitle>
							<CardDescription>
								Zapisz publiczną deklarację i porozmawiaj z osobami z tego samego lotu.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									const topVariant = result.variants[0];
									saveRoomIntent({
										flightInstanceId: flight.id,
										selection: { kind: "shared_taxi" },
										...(topVariant
											? { publicOption: publicSelectionFromJourneyVariant(topVariant) }
											: {}),
									});
									rememberDropOff();
									window.location.assign("/app");
								}}
							>
								Szukam taksówki — do pokoju
							</Button>
						</CardContent>
					</Card>
				</>
			) : null}
			{result && result.status !== "recommendations" ? (
				<JourneyFailure
					result={result}
					onRetry={() => setRetryKey((value) => value + 1)}
					onChangeParameters={() =>
						document.querySelector<HTMLInputElement>("#journey-buffer")?.focus()
					}
				/>
			) : null}
		</section>
	);
}
