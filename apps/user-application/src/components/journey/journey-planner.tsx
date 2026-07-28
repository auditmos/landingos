import type { PrivateDestination } from "@repo/data-ops/destination";
import type { FlightInstance } from "@repo/data-ops/flight";
import type { JourneyRecommendationResult, JourneyVariant } from "@repo/data-ops/journey";
import { Clock3, ExternalLink, Footprints, RotateCcw, Route, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	formatJourneyArrival,
	formatJourneyCost,
	journeyBadgeCopy,
	journeyFailureCopy,
	journeyUnavailableFromError,
	recommendJourneysApi,
} from "@/lib/journey-planner";
import { publicSelectionFromJourneyVariant, saveRoomIntent } from "@/lib/room-intent";
import { cn } from "@/lib/utils";

const modeCopy = {
	bus: "Autobus",
	train: "Pociąg",
	metro: "Metro",
	tram: "Tramwaj",
	walk: "Pieszo",
} as const;

export function JourneyVariantCard({
	variant,
	onChoose,
}: {
	variant: JourneyVariant;
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
						<dd className="font-semibold tabular-nums">{variant.walkingMeters} m</dd>
					</div>
				</dl>

				<ol className="space-y-2">
					{variant.steps.map((step, index) => (
						<li
							key={`${step.mode}:${step.from}:${step.to}:${index}`}
							className="rounded-md bg-muted/50 p-3"
						>
							<p className="font-medium tabular-nums">
								{index + 1}. {modeCopy[step.mode]} · {step.durationMinutes} min
							</p>
							<p className="text-pretty text-sm text-muted-foreground">
								{step.from} → {step.to}
							</p>
							{step.walkingMeters > 0 ? (
								<p className="text-xs text-muted-foreground tabular-nums">
									<Footprints className="mr-1 inline size-3" />
									{step.walkingMeters} m pieszo
								</p>
							) : null}
						</li>
					))}
				</ol>

				<div className="text-sm tabular-nums">
					<p className="font-medium">Źródła</p>
					<ul className="text-muted-foreground">
						{variant.sourceReferences.map((source) => (
							<li key={`${source.kind}:${source.label}`}>
								{source.label}
								{source.checkedAt
									? ` · sprawdzono ${new Date(source.checkedAt).toLocaleDateString("pl-PL")}`
									: ""}
							</li>
						))}
					</ul>
				</div>

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

				{variant.externalLinks.map((link) => (
					<Button key={link.url} asChild>
						<a href={link.url} target="_blank" rel="noopener noreferrer">
							{link.label}
							<ExternalLink className="size-4" />
						</a>
					</Button>
				))}
				{onChoose ? (
					<Button type="button" variant="secondary" onClick={() => onChoose(variant)}>
						<Users className="size-4" />
						Wybierz i przejdź do pokoju
					</Button>
				) : null}
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
	return (
		<Alert variant="destructive">
			<AlertTitle className="text-balance">Nie udało się przygotować rekomendacji</AlertTitle>
			<AlertDescription>
				<p className="text-pretty">{journeyFailureCopy[result.reason]}</p>
				<div className="mt-3 flex flex-wrap gap-2">
					<Button type="button" size="sm" variant="outline" onClick={onRetry}>
						<RotateCcw className="size-4" />
						Spróbuj ponownie
					</Button>
					<Button type="button" size="sm" variant="outline" onClick={onChangeParameters}>
						Zmień parametry
					</Button>
				</div>
				{result.manualAlternatives.length > 0 ? (
					<div className="mt-3">
						<p>Alternatywy ręczne:</p>
						{result.manualAlternatives.map((link) => (
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
	const [retryKey, setRetryKey] = useState(0);
	const [result, setResult] = useState<JourneyRecommendationResult>();
	const [loading, setLoading] = useState(false);
	const { latitude, longitude } = destination.coordinates;

	function continueToRoom(selection: ReturnType<typeof publicSelectionFromJourneyVariant>) {
		saveRoomIntent({ flightInstanceId: flight.id, selection });
		window.location.assign("/app");
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
						Bufor po planowanym lądowaniu uwzględnia wyjście z lotniska i bagaż.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<label className="text-sm font-medium tabular-nums" htmlFor="journey-buffer">
						Bufor po lądowaniu: {bufferMinutes} min
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
						Zakres 15–180 min, krok 5 min.
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
			{result?.status === "recommendations" ? (
				<>
					{result.explanation ? (
						<Alert>
							<AlertDescription>{result.explanation}</AlertDescription>
						</Alert>
					) : null}
					{result.variants.map((variant) => (
						<JourneyVariantCard
							key={variant.id}
							variant={variant}
							onChoose={(selected) => continueToRoom(publicSelectionFromJourneyVariant(selected))}
						/>
					))}
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
									saveRoomIntent({
										flightInstanceId: flight.id,
										selection: { kind: "shared_taxi" },
									});
									window.location.assign("/app");
								}}
							>
								Przejdź do pokoju lotu
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
