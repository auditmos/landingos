import type { PrivateDestination } from "@repo/data-ops/destination";
import {
	type FlightInstance,
	FlightLookupRequestSchema,
	type FlightResolveResult,
} from "@repo/data-ops/flight";
import { CheckCircle2, MapPin, Plane, RotateCcw } from "lucide-react";
import { type FormEvent, useState } from "react";
import { DestinationPlanner } from "@/components/destination/destination-planner";
import { JourneyPlanner } from "@/components/journey/journey-planner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	completeManualFlightApi,
	formatArrivalInRome,
	formatDepartureDate,
	manualReasonCopy,
	resolveFlightApi,
} from "@/lib/flight-planner";

type FieldErrors = Partial<Record<"flightNumber" | "departureLocalDate", string>>;

export function FlightSummary({ flight }: { flight: FlightInstance }) {
	const flightLabel = `${flight.marketingCarrierCode}${flight.marketingFlightNumber}`;
	return (
		<Card className="border-success/30 bg-success/5" aria-live="polite">
			<CardHeader>
				<div className="flex items-center gap-2">
					<CheckCircle2 className="h-5 w-5 text-success" />
					<Badge variant="success">Lot rozpoznany</Badge>
				</div>
				<CardTitle className="text-2xl">
					{flight.marketingCarrierName} {flightLabel}
				</CardTitle>
				<CardDescription>
					Data wylotu: {formatDepartureDate(flight.departureLocalDate)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<dl className="grid gap-4 sm:grid-cols-3">
					<div>
						<dt className="text-sm text-muted-foreground">Wylot</dt>
						<dd className="mt-1 text-lg font-semibold">
							{flight.originIata === "ZZZ" ? "Polska" : flight.originIata}
						</dd>
					</div>
					<div>
						<dt className="text-sm text-muted-foreground">Przylot</dt>
						<dd className="mt-1 text-lg font-semibold">BGY</dd>
					</div>
					<div>
						<dt className="text-sm text-muted-foreground">Planowany przylot</dt>
						<dd className="mt-1 text-lg font-semibold">
							{formatArrivalInRome(flight.scheduledArrivalUtc)}
						</dd>
						<p className="text-xs text-muted-foreground">czas lokalny w Bergamo</p>
					</div>
				</dl>
			</CardContent>
		</Card>
	);
}

export function FlightPlanner() {
	const [flightNumber, setFlightNumber] = useState("");
	const [departureLocalDate, setDepartureLocalDate] = useState("");
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	const [result, setResult] = useState<FlightResolveResult | null>(null);
	const [manualArrival, setManualArrival] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [destination, setDestination] = useState<PrivateDestination>();

	async function submitLookup(event?: FormEvent) {
		event?.preventDefault();
		setError("");
		const parsed = FlightLookupRequestSchema.safeParse({ flightNumber, departureLocalDate });
		if (!parsed.success) {
			const fields = parsed.error.flatten().fieldErrors;
			setFieldErrors({
				flightNumber: fields.flightNumber?.[0],
				departureLocalDate: fields.departureLocalDate?.[0],
			});
			return;
		}
		setFieldErrors({});
		setDestination(undefined);
		setFlightNumber(parsed.data.flightNumber);
		setDepartureLocalDate(parsed.data.departureLocalDate);
		setLoading(true);
		try {
			const next = await resolveFlightApi(parsed.data);
			setResult(next);
			if (next.status === "manual_required" && !manualArrival) {
				setManualArrival(`${next.departureLocalDate}T12:00`);
			}
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Nie udało się sprawdzić lotu.");
		} finally {
			setLoading(false);
		}
	}

	async function submitManual(event: FormEvent) {
		event.preventDefault();
		if (result?.status !== "manual_required") return;
		setError("");
		setLoading(true);
		try {
			const completed = await completeManualFlightApi({
				flightNumber: result.flightNumber,
				departureLocalDate: result.departureLocalDate,
				destinationIata: "BGY",
				scheduledArrivalUtc: new Date(manualArrival).toISOString(),
			});
			setResult(completed);
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Nie udało się zapisać godziny przylotu.",
			);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
			<header className="border-b bg-background/80 backdrop-blur">
				<div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-4 sm:px-6">
					<Plane className="h-6 w-6 text-primary" />
					<span className="text-xl font-bold">LandingOS</span>
					<span className="ml-auto text-sm text-muted-foreground">Polska → Bergamo</span>
				</div>
			</header>
			<main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:py-16">
				<section>
					<Badge variant="secondary">Planer podróży BGY</Badge>
					<h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
						Zacznij od swojego lotu
					</h1>
					<p className="mt-4 max-w-xl text-lg text-muted-foreground">
						Podaj numer lotu z Polski i datę wylotu. Rozpoznamy planowany przylot do
						Mediolanu-Bergamo — bez logowania.
					</p>
				</section>

				<section className="space-y-5">
					<Card>
						<CardHeader>
							<CardTitle>Sprawdź lot</CardTitle>
							<CardDescription>Data oznacza lokalną datę planowanego wylotu.</CardDescription>
						</CardHeader>
						<CardContent>
							<form className="space-y-4" onSubmit={submitLookup} noValidate>
								<div>
									<label className="mb-1.5 block text-sm font-medium" htmlFor="flight-number">
										Numer lotu
									</label>
									<Input
										id="flight-number"
										name="flightNumber"
										placeholder="np. FR1234"
										autoComplete="off"
										value={flightNumber}
										onChange={(event) => setFlightNumber(event.target.value)}
										aria-invalid={Boolean(fieldErrors.flightNumber)}
										aria-describedby="flight-number-error"
									/>
									{fieldErrors.flightNumber ? (
										<p id="flight-number-error" className="mt-1 text-sm text-destructive">
											{fieldErrors.flightNumber}
										</p>
									) : null}
								</div>
								<div>
									<label className="mb-1.5 block text-sm font-medium" htmlFor="departure-date">
										Data wylotu
									</label>
									<Input
										id="departure-date"
										name="departureLocalDate"
										type="date"
										value={departureLocalDate}
										onChange={(event) => setDepartureLocalDate(event.target.value)}
										aria-invalid={Boolean(fieldErrors.departureLocalDate)}
										aria-describedby="departure-date-error"
									/>
									{fieldErrors.departureLocalDate ? (
										<p id="departure-date-error" className="mt-1 text-sm text-destructive">
											{fieldErrors.departureLocalDate}
										</p>
									) : null}
								</div>
								<Button className="w-full" size="lg" type="submit" disabled={loading}>
									{loading ? "Sprawdzamy lot…" : "Sprawdź lot"}
								</Button>
							</form>
						</CardContent>
					</Card>

					{error ? (
						<Alert variant="destructive">
							<AlertTitle>Nie udało się wykonać operacji</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					) : null}

					{result?.status === "manual_required" ? (
						<Card>
							<CardHeader>
								<CardTitle>Uzupełnij przylot ręcznie</CardTitle>
								<CardDescription>
									{manualReasonCopy[result.reason]} Zachowaliśmy numer {result.flightNumber} i datę{" "}
									{formatDepartureDate(result.departureLocalDate)}.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<form className="space-y-4" onSubmit={submitManual}>
									<div>
										<label className="mb-1.5 block text-sm font-medium" htmlFor="airport">
											Lotnisko przylotu
										</label>
										<Input id="airport" value="BGY — Mediolan-Bergamo" readOnly />
									</div>
									<div>
										<label className="mb-1.5 block text-sm font-medium" htmlFor="arrival">
											Planowana data i godzina przylotu
										</label>
										<Input
											id="arrival"
											type="datetime-local"
											value={manualArrival}
											onChange={(event) => setManualArrival(event.target.value)}
											required
										/>
									</div>
									<div className="grid gap-2 sm:grid-cols-2">
										<Button type="submit" disabled={loading || !manualArrival}>
											<MapPin className="h-4 w-4" />
											Zapisz i kontynuuj
										</Button>
										<Button
											type="button"
											variant="outline"
											disabled={loading}
											onClick={() => submitLookup()}
										>
											<RotateCcw className="h-4 w-4" />
											Spróbuj ponownie
										</Button>
									</div>
								</form>
							</CardContent>
						</Card>
					) : null}

					{result?.status === "recognized" ? (
						<>
							<FlightSummary flight={result.flight} />
							<DestinationPlanner onDestinationChange={setDestination} />
							{destination ? (
								<JourneyPlanner flight={result.flight} destination={destination} />
							) : null}
						</>
					) : null}
				</section>
			</main>
		</div>
	);
}
