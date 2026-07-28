import type { PrivateDestination } from "@repo/data-ops/destination";
import {
	type FlightInstance,
	FlightLookupRequestSchema,
	type FlightResolveResult,
} from "@repo/data-ops/flight";
import { ArrowRight, CheckCircle2, MapPin, Plane, RotateCcw } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileHandle } from "@/components/auth/turnstile";
import { DestinationPlanner } from "@/components/destination/destination-planner";
import { JourneyPlanner } from "@/components/journey/journey-planner";
import { ThemeToggle } from "@/components/theme";
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
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

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
						<dd className="mt-1 text-lg font-semibold">{flight.destinationIata}</dd>
					</div>
					<div>
						<dt className="text-sm text-muted-foreground">Planowany przylot</dt>
						<dd className="mt-1 text-lg font-semibold">
							{formatArrivalInRome(flight.scheduledArrivalUtc)}
						</dd>
						<p className="text-xs text-muted-foreground">czas lokalny w miejscu przylotu</p>
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
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);
	const captchaRef = useRef<TurnstileHandle>(null);
	const captchaRequired = Boolean(TURNSTILE_SITE_KEY);
	const resultsRef = useRef<HTMLElement>(null);

	// Once a lookup resolves (or errors), bring the results into view so the answer
	// is visible without scrolling — on mobile the form fills the first screen.
	useEffect(() => {
		if (!result && !error) return;
		const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		resultsRef.current?.scrollIntoView?.({
			behavior: reduceMotion ? "auto" : "smooth",
			block: "start",
		});
	}, [result, error]);

	// Turnstile tokens are single-use — drop the current one and re-run the widget
	// so the next lookup has a fresh token ready. No-op when the challenge is off.
	function refreshCaptcha() {
		setCaptchaToken(null);
		captchaRef.current?.reset();
	}

	function applyLookupResult(next: FlightResolveResult) {
		setResult(next);
		if (next.status === "manual_required" && !manualArrival) {
			setManualArrival(`${next.departureLocalDate}T12:00`);
		}
	}

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
		if (captchaRequired && !captchaToken) {
			setError("Potwierdź, że nie jesteś robotem.");
			return;
		}
		setFieldErrors({});
		setDestination(undefined);
		setFlightNumber(parsed.data.flightNumber);
		setDepartureLocalDate(parsed.data.departureLocalDate);
		setLoading(true);
		try {
			applyLookupResult(await resolveFlightApi(parsed.data, fetch, captchaToken ?? undefined));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Nie udało się sprawdzić lotu.");
		} finally {
			setLoading(false);
			refreshCaptcha();
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
		<div className="min-h-dvh bg-muted/30 text-foreground">
			<header className="border-b bg-background">
				<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
					<a className="flex items-center gap-3" href="/" aria-label="LandingOS — strona główna">
						<span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
							<Plane className="size-5" />
						</span>
						<span className="text-xl font-bold">LandingOS</span>
					</a>
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
							<span>Polska</span>
							<ArrowRight className="size-4" aria-hidden="true" />
							<span className="text-foreground">Mediolan</span>
						</div>
						<ThemeToggle />
					</div>
				</div>
			</header>

			<main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
				<div className="grid overflow-hidden rounded-3xl border bg-card shadow-xl lg:grid-cols-[1.05fr_0.95fr]">
					<section className="flex flex-col justify-between bg-primary/5 p-6 sm:p-10 lg:p-14">
						<div>
							<p className="flex items-center gap-3 text-sm font-semibold text-primary">
								<span
									className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
									aria-hidden="true"
								>
									1
								</span>
								Zacznij od lotu
							</p>
							<h1 className="mt-6 max-w-xl text-balance text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
								Z lotniska prosto do celu w Mediolanie
							</h1>
							<p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">
								Podaj numer lotu i datę wylotu. Dopasujemy czas przylotu, a potem pokażemy
								maksymalnie trzy sensowne warianty przejazdu.
							</p>
						</div>

						<ul className="mt-10 hidden gap-5 lg:grid">
							<li className="flex gap-3">
								<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
								<div>
									<p className="font-semibold">Start bez konta</p>
									<p className="mt-1 text-pretty text-sm leading-6 text-muted-foreground">
										Najpierw sprawdzasz lot. Logowanie jest potrzebne dopiero do pokoju.
									</p>
								</div>
							</li>
							<li className="flex gap-3">
								<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
								<div>
									<p className="font-semibold">Do 3 konkretnych opcji</p>
									<p className="mt-1 text-pretty text-sm leading-6 text-muted-foreground">
										Porównasz czas przejazdu, przesiadki i odcinki piesze.
									</p>
								</div>
							</li>
							<li className="flex gap-3">
								<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
								<div>
									<p className="font-semibold">Cel pozostaje prywatny</p>
									<p className="mt-1 text-pretty text-sm leading-6 text-muted-foreground">
										Dokładny adres nigdy nie trafia do pokoju wspólnego lotu.
									</p>
								</div>
							</li>
						</ul>
					</section>

					<section
						className="flex items-center border-t bg-card p-6 sm:p-10 lg:border-l lg:border-t-0 lg:p-14"
						aria-labelledby="flight-lookup-title"
					>
						<div className="mx-auto w-full max-w-md">
							<p className="text-sm font-semibold text-primary">Etap 1 z 3</p>
							<h2 id="flight-lookup-title" className="mt-2 text-balance text-3xl font-bold">
								Znajdź swój lot
							</h2>
							<p className="mt-3 text-pretty leading-7 text-muted-foreground">
								Numer lotu znajdziesz na bilecie lub karcie pokładowej.
							</p>

							<form className="mt-8 space-y-5" onSubmit={submitLookup} noValidate>
								<div>
									<label className="mb-2 block text-sm font-semibold" htmlFor="flight-number">
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
										aria-describedby={fieldErrors.flightNumber ? "flight-number-error" : undefined}
										className="h-12 bg-background px-4 text-base"
									/>
									{fieldErrors.flightNumber ? (
										<p id="flight-number-error" className="mt-2 text-sm text-destructive">
											{fieldErrors.flightNumber}
										</p>
									) : null}
								</div>
								<div>
									<label className="mb-2 block text-sm font-semibold" htmlFor="departure-date">
										Data wylotu
									</label>
									<Input
										id="departure-date"
										name="departureLocalDate"
										type="date"
										value={departureLocalDate}
										onChange={(event) => setDepartureLocalDate(event.target.value)}
										aria-invalid={Boolean(fieldErrors.departureLocalDate)}
										aria-describedby={
											fieldErrors.departureLocalDate
												? "departure-date-error"
												: "departure-date-help"
										}
										className="h-12 bg-background px-4 text-base"
									/>
									{fieldErrors.departureLocalDate ? (
										<p id="departure-date-error" className="mt-2 text-sm text-destructive">
											{fieldErrors.departureLocalDate}
										</p>
									) : (
										<p id="departure-date-help" className="mt-2 text-sm text-muted-foreground">
											Wybierz lokalną datę wylotu z Polski.
										</p>
									)}
								</div>
								{TURNSTILE_SITE_KEY ? (
									<Turnstile
										ref={captchaRef}
										siteKey={TURNSTILE_SITE_KEY}
										action="flight-lookup"
										onVerify={setCaptchaToken}
										onExpire={() => setCaptchaToken(null)}
										onError={() => setCaptchaToken(null)}
									/>
								) : null}
								<Button
									className="h-12 w-full"
									size="lg"
									type="submit"
									disabled={loading || (captchaRequired && !captchaToken)}
								>
									{loading ? "Sprawdzamy lot…" : "Sprawdź lot"}
									{loading ? null : <ArrowRight className="size-4" aria-hidden="true" />}
								</Button>
							</form>
							<p className="mt-5 text-pretty text-center text-xs leading-5 text-muted-foreground">
								Na tym etapie nie potrzebujemy Twojego adresu ani konta.
							</p>
						</div>
					</section>
				</div>

				<section
					ref={resultsRef}
					className="mx-auto mt-6 max-w-4xl space-y-5 scroll-mt-6"
					aria-label="Wynik planowania lotu"
				>
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
											Miejsce przylotu
										</label>
										<Input id="airport" value="Mediolan" readOnly />
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

				<p className="mt-8 text-center text-pretty text-sm text-muted-foreground">
					Lot → cel w Mediolanie → maksymalnie 3 warianty przejazdu
				</p>
			</main>
		</div>
	);
}
