import type {
	DestinationAutocompleteResult,
	DestinationPrediction,
	DestinationSelectionResult,
	PrivateDestination,
} from "@repo/data-ops/destination";
import { CheckCircle2, MapPin, RotateCcw, Search } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	autocompleteDestinationApi,
	createDestinationSearchScheduler,
	createDestinationSessionToken,
	destinationReasonCopy,
	selectDestinationApi,
} from "@/lib/destination-planner";

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

export function DestinationPlanner({
	onDestinationChange,
}: {
	onDestinationChange?: (destination: PrivateDestination | undefined) => void;
} = {}) {
	const [query, setQuery] = useState("");
	const [predictions, setPredictions] = useState<DestinationPrediction[]>([]);
	const [autocompleteFault, setAutocompleteFault] = useState<
		Extract<DestinationAutocompleteResult, { status: "autocomplete_unavailable" }> | undefined
	>();
	const [selectedPrediction, setSelectedPrediction] = useState<DestinationPrediction>();
	const [selectionResult, setSelectionResult] = useState<DestinationSelectionResult>();
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [sessionToken, setSessionToken] = useState(createDestinationSessionToken);
	const inputRef = useRef<HTMLInputElement>(null);
	const selectionInFlight = useRef(false);
	const scheduler = useMemo(
		() =>
			createDestinationSearchScheduler((nextQuery, signal) =>
				autocompleteDestinationApi({ query: nextQuery, sessionToken }, signal),
			),
		[sessionToken],
	);
	useEffect(() => () => scheduler.cancel(), [scheduler]);

	function receiveAutocomplete(result: DestinationAutocompleteResult) {
		setLoading(false);
		if (result.status === "suggestions") {
			setPredictions(result.predictions);
			setAutocompleteFault(undefined);
		} else {
			setPredictions([]);
			setAutocompleteFault(result);
		}
	}

	function scheduleSearch(nextQuery: string) {
		onDestinationChange?.(undefined);
		setQuery(nextQuery);
		setPredictions([]);
		setAutocompleteFault(undefined);
		setSelectedPrediction(undefined);
		setSelectionResult(undefined);
		setError("");
		const eligible = scheduler.update(nextQuery, receiveAutocomplete, (caught) => {
			setLoading(false);
			setError(
				caught instanceof Error
					? caught.message
					: "Nie udało się wyszukać miejsca. Spróbuj ponownie.",
			);
		});
		setLoading(eligible);
	}

	async function selectPrediction(prediction: DestinationPrediction) {
		if (selectionInFlight.current) return;
		selectionInFlight.current = true;
		scheduler.cancel();
		setSelectedPrediction(prediction);
		setPredictions([]);
		setSelectionResult(undefined);
		setAutocompleteFault(undefined);
		setError("");
		setLoading(true);
		try {
			const next = await selectDestinationApi({
				placeId: prediction.placeId,
				sessionToken,
			});
			setSelectionResult(next);
			onDestinationChange?.(next.status === "destination_selected" ? next.destination : undefined);
		} catch (caught) {
			onDestinationChange?.(undefined);
			setError(
				caught instanceof Error ? caught.message : "Nie udało się sprawdzić wybranego miejsca.",
			);
		} finally {
			selectionInFlight.current = false;
			setSessionToken(createDestinationSessionToken());
			setLoading(false);
		}
	}

	function changeInput() {
		onDestinationChange?.(undefined);
		setSelectedPrediction(undefined);
		setSelectionResult(undefined);
		setAutocompleteFault(undefined);
		setError("");
		inputRef.current?.focus();
		inputRef.current?.select();
	}

	const unavailableReason =
		autocompleteFault?.reason ??
		(selectionResult?.status === "destination_unavailable" ? selectionResult.reason : undefined);

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

				{unavailableReason ? (
					<Alert className="mt-4" variant="destructive">
						<AlertTitle>Nie udało się znaleźć miejsca</AlertTitle>
						<AlertDescription>
							<p>{destinationReasonCopy[unavailableReason]}</p>
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

				{selectionResult?.status === "destination_not_supported" ? (
					<Alert className="mt-4" variant="destructive">
						<AlertTitle>Cel jeszcze nieobsługiwany</AlertTitle>
						<AlertDescription>
							<p>
								{selectedPrediction?.primaryText} jest poza obsługiwanym obszarem Mediolanu. Lot i
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

				{selectionResult?.status === "destination_selected" ? (
					<Alert className="mt-4">
						<CheckCircle2 className="h-4 w-4" />
						<AlertTitle>Miejsce wybrane</AlertTitle>
						<AlertDescription>
							{selectionResult.destination.displayName}
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

				{error ? (
					<Alert className="mt-4" variant="destructive">
						<AlertTitle>Nie udało się wykonać operacji</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				) : null}
			</CardContent>
		</Card>
	);
}
