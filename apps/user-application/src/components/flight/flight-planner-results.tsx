import type { PrivateDestination } from "@repo/data-ops/destination";
import {
	type FlightInstance,
	type FlightResolveResult,
	formatFlightLabel,
} from "@repo/data-ops/flight";
import { CheckCircle2, MapPin, RotateCcw } from "lucide-react";
import type { FormEvent } from "react";
import { DestinationPlanner } from "@/components/destination/destination-planner";
import { JourneyPlanner } from "@/components/journey/journey-planner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldInfo, PolishPicker } from "@/components/ui/field-controls";
import { Input } from "@/components/ui/input";
import { ProviderFailureNotice } from "@/components/ui/provider-failure-notice";
import { formatArrivalInRome, formatDepartureDate, manualReasonCopy } from "@/lib/flight-planner";
import { flightOutcomeGuidance } from "@/lib/provider-diagnostics";

export function FlightSummary({ flight }: { flight: FlightInstance }) {
	return (
		<Card className="border-success/30 bg-success/5" aria-live="polite">
			<CardHeader>
				<div className="flex items-center gap-2">
					<CheckCircle2 className="size-5 text-success" />
					<Badge variant="success">Lot rozpoznany</Badge>
				</div>
				<CardTitle className="text-2xl">{formatFlightLabel(flight)}</CardTitle>
				<CardDescription>
					Data wylotu: {formatDepartureDate(flight.departureLocalDate)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{flight.source === "manual" ? (
					<p className="mb-4 text-sm font-medium text-muted-foreground">
						Godzina przylotu podana przez podróżnych — niezweryfikowana przez dostawcę.
					</p>
				) : null}
				<dl className="grid gap-4 sm:grid-cols-3">
					<div>
						<dt className="text-sm text-muted-foreground">Wylot</dt>
						<dd className="mt-1 text-lg font-semibold">
							{flight.originIata === "ZZZ" ? "Polska" : flight.originIata}
						</dd>
					</div>
					<div>
						<dt className="text-sm text-muted-foreground">Przylot</dt>
						<dd className="mt-1 text-lg font-semibold">{flight.destinationIata}</dd>
					</div>
					<div>
						<dt className="text-sm text-muted-foreground">Planowany przylot</dt>
						<dd className="mt-1 text-lg font-semibold tabular-nums">
							{formatArrivalInRome(flight.scheduledArrivalUtc)}
						</dd>
						<p className="text-xs text-muted-foreground">czas lokalny w miejscu przylotu</p>
					</div>
				</dl>
			</CardContent>
		</Card>
	);
}

/**
 * One lookup outcome at a time. The traveler's destination lives *under*
 * `resolved`, so a failed or superseded lookup cannot leave a previous flight's
 * summary or selection standing beside it. `attempt` is the destination stage's
 * lifetime: it keys `DestinationPlanner`, giving each resolution a fresh one
 * instead of an in-place reconciliation that would keep claiming "Miejsce
 * wybrane" for a flight the traveler already replaced.
 */
export type FlightLookupState =
	| { phase: "idle" }
	| { phase: "loading" }
	| { phase: "failed"; message: string }
	| {
			phase: "resolved";
			attempt: number;
			result: FlightResolveResult;
			destination?: PrivateDestination;
			manualError?: string;
			manualPending?: boolean;
	  };

function ManualArrivalCard({
	result,
	manualArrival,
	manualArrivalError,
	busy,
	onManualArrivalChange,
	onManualSubmit,
	onRetry,
}: {
	result: Extract<FlightResolveResult, { status: "manual_required" }>;
	manualArrival: string;
	manualArrivalError: string;
	busy: boolean;
	onManualArrivalChange: (value: string) => void;
	onManualSubmit: (event: FormEvent) => void;
	onRetry: () => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Uzupełnij przylot ręcznie</CardTitle>
				<CardDescription>
					<ProviderFailureNotice
						message={`${manualReasonCopy[result.reason]} Nie otrzymaliśmy godziny przylotu od dostawcy. Zachowaliśmy numer ${result.flightNumber} i datę ${formatDepartureDate(result.departureLocalDate)}.`}
						guidance={flightOutcomeGuidance[result.reason]}
						diagnostic={result.diagnostic}
					/>
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-4" onSubmit={onManualSubmit}>
					<div>
						<label className="mb-1.5 block text-sm font-medium" htmlFor="airport">
							Miejsce przylotu
						</label>
						<Input id="airport" value="Mediolan" readOnly />
					</div>
					<div>
						<div className="mb-1.5 flex items-center gap-1">
							<label className="text-sm font-medium" htmlFor="arrival-native">
								Planowana data i godzina przylotu
							</label>
							<FieldInfo label="format daty i godziny przylotu">
								Format: DD.MM.RRRR, GG:MM (24 godz.), np. 04.08.2026, 14:30.
							</FieldInfo>
						</div>
						<PolishPicker
							id="arrival"
							name="scheduledArrivalLocal"
							label="Planowana data i godzina przylotu"
							type="datetime-local"
							value={manualArrival}
							onChange={onManualArrivalChange}
							invalid={Boolean(manualArrivalError)}
							describedBy={manualArrivalError ? "arrival-error" : undefined}
							allowTyping
						/>
						{manualArrivalError ? (
							<p id="arrival-error" className="mt-2 text-sm text-destructive">
								{manualArrivalError}
							</p>
						) : null}
					</div>
					<div className="grid gap-2 sm:grid-cols-2">
						<Button type="submit" disabled={busy || !manualArrival}>
							<MapPin className="size-4" />
							Zapisz i kontynuuj
						</Button>
						<Button type="button" variant="outline" disabled={busy} onClick={onRetry}>
							<RotateCcw className="size-4" />
							Spróbuj ponownie
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

interface PlannerResultsProps {
	state: FlightLookupState;
	manualArrival: string;
	manualArrivalError: string;
	onManualArrivalChange: (value: string) => void;
	onManualSubmit: (event: FormEvent) => void;
	onRetry: () => void;
	onDestinationChange: (destination?: PrivateDestination) => void;
}

export function PlannerResults({
	state,
	manualArrival,
	manualArrivalError,
	onManualArrivalChange,
	onManualSubmit,
	onRetry,
	onDestinationChange,
}: PlannerResultsProps) {
	const resolved = state.phase === "resolved" ? state : null;
	// Lookup failure and manual-completion failure are different operations, and
	// only one of them can be current — because only one phase can be.
	const error = state.phase === "failed" ? state.message : (resolved?.manualError ?? "");
	const busy = state.phase === "loading" || resolved?.manualPending === true;
	const manualResult = resolved?.result.status === "manual_required" ? resolved.result : null;
	const manualArrivalConflict =
		resolved?.result.status === "recognized" ? resolved.result.manualArrivalConflict : undefined;
	return (
		<>
			{error ? (
				<Alert variant="destructive">
					<AlertTitle>Nie udało się wykonać operacji</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}

			{manualResult ? (
				<ManualArrivalCard
					result={manualResult}
					manualArrival={manualArrival}
					manualArrivalError={manualArrivalError}
					busy={busy}
					onManualArrivalChange={onManualArrivalChange}
					onManualSubmit={onManualSubmit}
					onRetry={onRetry}
				/>
			) : null}

			{resolved && resolved.result.status === "recognized" ? (
				<>
					{manualArrivalConflict ? (
						<Alert>
							<AlertTitle>Wspólna godzina przylotu</AlertTitle>
							<AlertDescription>
								Podana godzina różni się od zapisanej wcześniej. Korzystamy ze wspólnej godziny
								przylotu {formatArrivalInRome(manualArrivalConflict.sharedScheduledArrivalUtc)}. Ta
								godzina wyznacza też zamknięcie pokoju 24 godziny po przylocie.
							</AlertDescription>
						</Alert>
					) : null}
					<FlightSummary flight={resolved.result.flight} />
					<DestinationPlanner key={resolved.attempt} onDestinationChange={onDestinationChange} />
					{resolved.destination ? (
						<JourneyPlanner flight={resolved.result.flight} destination={resolved.destination} />
					) : null}
				</>
			) : null}
		</>
	);
}
