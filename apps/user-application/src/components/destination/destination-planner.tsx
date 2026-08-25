import type {
	DestinationAutocompleteResult,
	DestinationPrediction,
	DestinationSelectionResult,
	DestinationUnavailableReason,
	PrivateDestination,
} from "@repo/data-ops/destination";
import type { ProviderDiagnostic } from "@repo/data-ops/diagnostics";
import { CheckCircle2, MapPin, RotateCcw, Search } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProviderFailureNotice } from "@/components/ui/provider-failure-notice";
import {
	autocompleteDestinationApi,
	createDestinationSearchScheduler,
	createDestinationSessionToken,
	destinationReasonCopy,
	selectDestinationApi,
} from "@/lib/destination-planner";
import { destinationOutcomeGuidance } from "@/lib/provider-diagnostics";

export function DestinationPredictionList({
	predictions,
	disabled,
	onSelect,
}: {
	predictions: DestinationPrediction[];
	disabled?: boolean;
	onSelect: (prediction: DestinationPrediction) => void;
}) {
	if (predictions.length === 0) return null;
	return (
		<ul className="mt-2 overflow-hidden rounded-md border bg-background">
			{predictions.map((prediction) => (
				<li key={prediction.placeId} className="border-b last:border-b-0">
					<button
						type="button"
						className="flex w-full flex-col px-3 py-3 text-left hover:bg-muted/60 disabled:opacity-60"
						disabled={disabled}
						onClick={() => onSelect(prediction)}
					>
						<span className="font-medium">{prediction.primaryText}</span>
						<span className="text-sm text-muted-foreground">{prediction.secondaryText}</span>
					</button>
				</li>
			))}
		</ul>
	);
}

/**
 * Exactly one thing is true of the destination stage at a time. Autocomplete and
 * selection faults land in the same `fault` phase because they render the same
 * way and can never both be current; "in flight" and "loading" are questions
 * about the phase, not fields that have to be kept consistent with it.
 */
type DestinationOutcome =
	| { phase: "idle" }
	| { phase: "searching" }
	| { phase: "suggestions"; predictions: DestinationPrediction[] }
	| { phase: "fault"; reason: DestinationUnavailableReason; diagnostic?: ProviderDiagnostic }
	| { phase: "selecting"; prediction: DestinationPrediction }
	| { phase: "selected"; destination: PrivateDestination }
	| { phase: "unsupported"; prediction: DestinationPrediction }
	| { phase: "transport_error"; message: string };

function faultOutcome(result: {
	reason: DestinationUnavailableReason;
	diagnostic?: ProviderDiagnostic;
}): DestinationOutcome {
	return {
		phase: "fault",
		reason: result.reason,
		...(result.diagnostic ? { diagnostic: result.diagnostic } : {}),
	};
}

function selectionOutcome(
	result: DestinationSelectionResult,
	prediction: DestinationPrediction,
): DestinationOutcome {
	if (result.status === "destination_selected") {
		return { phase: "selected", destination: result.destination };
	}
	if (result.status === "destination_not_supported") return { phase: "unsupported", prediction };
	return faultOutcome(result);
}

export function DestinationPlanner({
	onDestinationChange,
}: {
	onDestinationChange?: (destination: PrivateDestination | undefined) => void;
} = {}) {
	const [query, setQuery] = useState("");
	const [outcome, setOutcome] = useState<DestinationOutcome>({ phase: "idle" });
	const [sessionToken, setSessionToken] = useState(createDestinationSessionToken);
	const inputRef = useRef<HTMLInputElement>(null);
	// Re-entrancy guard, not a copy of the phase: two clicks dispatched in one
	// tick both read the pre-render `outcome`, so the phase alone cannot stop
	// the second from opening a second billed selection request.
	const selecting = useRef(false);
	const scheduler = useMemo(
		() =>
			createDestinationSearchScheduler((nextQuery, signal) =>
				autocompleteDestinationApi({ query: nextQuery, sessionToken }, signal),
			),
		[sessionToken],
	);
	useEffect(() => () => scheduler.cancel(), [scheduler]);

	function receiveAutocomplete(result: DestinationAutocompleteResult) {
		// Only a search that is still the current phase may answer for it — a
		// result that outlived its search (the traveler has since selected, or
		// typed the query back under three characters) is not news.
		setOutcome((current) =>
			current.phase !== "searching"
				? current
				: result.status === "suggestions"
					? { phase: "suggestions", predictions: result.predictions }
					: faultOutcome(result),
		);
	}

	function scheduleSearch(nextQuery: string) {
		onDestinationChange?.(undefined);
		setQuery(nextQuery);
		const eligible = scheduler.update(nextQuery, receiveAutocomplete, (caught) => {
			setOutcome((current) =>
				current.phase === "searching"
					? {
							phase: "transport_error",
							message:
								caught instanceof Error
									? caught.message
									: "Nie udało się wyszukać miejsca. Spróbuj ponownie.",
						}
					: current,
			);
		});
		setOutcome(eligible ? { phase: "searching" } : { phase: "idle" });
	}

	async function selectPrediction(prediction: DestinationPrediction) {
		if (selecting.current) return;
		selecting.current = true;
		scheduler.cancel();
		setOutcome({ phase: "selecting", prediction });
		try {
			const next = await selectDestinationApi({
				placeId: prediction.placeId,
				sessionToken,
			});
			setOutcome(selectionOutcome(next, prediction));
			onDestinationChange?.(next.status === "destination_selected" ? next.destination : undefined);
		} catch (caught) {
			onDestinationChange?.(undefined);
			setOutcome({
				phase: "transport_error",
				message:
					caught instanceof Error ? caught.message : "Nie udało się sprawdzić wybranego miejsca.",
			});
		} finally {
			selecting.current = false;
			// One session token per selection attempt, per the provider's billing
			// session contract — rotated whichever way the attempt ended.
			setSessionToken(createDestinationSessionToken());
		}
	}

	function changeInput() {
		onDestinationChange?.(undefined);
		setOutcome({ phase: "idle" });
		inputRef.current?.focus();
		inputRef.current?.select();
	}

	const loading = outcome.phase === "searching" || outcome.phase === "selecting";
	const predictions = outcome.phase === "suggestions" ? outcome.predictions : [];

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center gap-2">
					<MapPin className="h-5 w-5 text-primary" />
					<CardTitle>Dokąd jedziesz w Mediolanie?</CardTitle>
				</div>
				<CardDescription>
					Wpisz adres, hotel albo nazwę miejsca i wybierz właściwą pozycję z listy.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<label className="mb-1.5 block text-sm font-medium" htmlFor="destination-query">
					Miejsce docelowe
				</label>
				<div className="relative">
					<Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
					<Input
						ref={inputRef}
						id="destination-query"
						name="destination"
						className="pl-9"
						placeholder="np. Hotel Berna lub Via Torino 42"
						autoComplete="off"
						value={query}
						onChange={(event: ChangeEvent<HTMLInputElement>) => scheduleSearch(event.target.value)}
					/>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					Wpisz co najmniej 3 znaki. Niczego nie wybierzemy automatycznie.
				</p>

				{loading ? <p className="mt-3 text-sm">Szukamy miejsca…</p> : null}
				<DestinationPredictionList
					predictions={predictions}
					disabled={loading}
					onSelect={selectPrediction}
				/>

				{outcome.phase === "fault" ? (
					<Alert className="mt-4" variant="destructive">
						<AlertTitle>Nie udało się znaleźć miejsca</AlertTitle>
						<AlertDescription>
							<ProviderFailureNotice
								message={destinationReasonCopy[outcome.reason]}
								guidance={destinationOutcomeGuidance[outcome.reason]}
								diagnostic={outcome.diagnostic}
							/>
							<div className="mt-3 flex flex-wrap gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => scheduleSearch(query)}
								>
									<RotateCcw className="h-4 w-4" />
									Spróbuj ponownie
								</Button>
								<Button type="button" size="sm" variant="outline" onClick={changeInput}>
									Zmień wpisane miejsce
								</Button>
							</div>
						</AlertDescription>
					</Alert>
				) : null}

				{outcome.phase === "unsupported" ? (
					<Alert className="mt-4" variant="destructive">
						<AlertTitle>Cel jeszcze nieobsługiwany</AlertTitle>
						<AlertDescription>
							<p>
								{outcome.prediction.primaryText} jest poza obsługiwanym obszarem Mediolanu. Lot i
								wpisane miejsce pozostały bez zmian.
							</p>
							<Button
								className="mt-3"
								type="button"
								size="sm"
								variant="outline"
								onClick={changeInput}
							>
								Zmień wpisane miejsce
							</Button>
						</AlertDescription>
					</Alert>
				) : null}

				{outcome.phase === "selected" ? (
					<Alert className="mt-4">
						<CheckCircle2 className="h-4 w-4" />
						<AlertTitle>Miejsce wybrane</AlertTitle>
						<AlertDescription>
							{outcome.destination.displayName}
							<Button
								className="mt-3 block"
								type="button"
								size="sm"
								variant="outline"
								onClick={changeInput}
							>
								Zmień miejsce
							</Button>
						</AlertDescription>
					</Alert>
				) : null}

				{outcome.phase === "transport_error" ? (
					<Alert className="mt-4" variant="destructive">
						<AlertTitle>Nie udało się wykonać operacji</AlertTitle>
						<AlertDescription>{outcome.message}</AlertDescription>
					</Alert>
				) : null}
			</CardContent>
		</Card>
	);
}
