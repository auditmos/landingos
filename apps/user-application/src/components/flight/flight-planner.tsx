import type { PrivateDestination } from "@repo/data-ops/destination";
import {
	type FlightLookupRequest,
	FlightLookupRequestSchema,
	type FlightResolveResult,
} from "@repo/data-ops/flight";
import { ArrowRight, CheckCircle2, Plane } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileHandle } from "@/components/auth/turnstile";
import { PlannerResults } from "@/components/flight/flight-planner-results";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { FieldInfo, PolishPicker } from "@/components/ui/field-controls";
import { Input } from "@/components/ui/input";
import { completeManualFlightApi, resolveFlightApi } from "@/lib/flight-planner";
import { currentDateInPoland, formatPolishDateTimeInput } from "@/lib/polish-date";

export { FlightSummary } from "@/components/flight/flight-planner-results";

type FieldErrors = Partial<Record<"flightNumber" | "departureLocalDate", string>>;
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

function parseLookupForm(
	flightNumber: string,
	departureLocalDate: string,
): { input: FlightLookupRequest; errors?: never } | { input?: never; errors: FieldErrors } {
	const parsed = FlightLookupRequestSchema.safeParse({
		flightNumber,
		departureLocalDate,
	});
	if (parsed.success) return { input: parsed.data };
	const fields = parsed.error.flatten().fieldErrors;
	return {
		errors: {
			flightNumber: fields.flightNumber?.[0],
			departureLocalDate: fields.departureLocalDate?.[0],
		},
	};
}

export function FlightPlanner() {
	const [flightNumber, setFlightNumber] = useState("");
	const [departureDateInput, setDepartureDateInput] = useState(currentDateInPoland);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	const [result, setResult] = useState<FlightResolveResult | null>(null);
	const [manualArrival, setManualArrival] = useState("");
	const [manualArrivalError, setManualArrivalError] = useState("");
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
			setManualArrivalError("");
		}
	}

	async function submitLookup(event?: FormEvent) {
		event?.preventDefault();
		setError("");
		const parsed = parseLookupForm(flightNumber, departureDateInput);
		if (parsed.errors) {
			setFieldErrors(parsed.errors);
			return;
		}
		if (captchaRequired && !captchaToken) {
			setError("Potwierdź, że nie jesteś robotem.");
			return;
		}
		setFieldErrors({});
		setDestination(undefined);
		setFlightNumber(parsed.input.flightNumber);
		setDepartureDateInput(parsed.input.departureLocalDate);
		setLoading(true);
		try {
			applyLookupResult(await resolveFlightApi(parsed.input, fetch, captchaToken ?? undefined));
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
		if (!formatPolishDateTimeInput(manualArrival)) {
			setManualArrivalError("Podaj prawidłową datę i godzinę w formacie DD.MM.RRRR, GG:MM.");
			return;
		}
		setManualArrivalError("");
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
									<div className="mb-2 flex items-center gap-1">
										<label className="text-sm font-semibold" htmlFor="flight-number">
											Numer lotu
										</label>
										<FieldInfo label="format numeru lotu">
											Format: dwuznakowy kod przewoźnika i od 1 do 4 cyfr, np. FR1234.
										</FieldInfo>
									</div>
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
									<div className="mb-2 flex items-center gap-1">
										<label className="text-sm font-semibold" htmlFor="departure-date">
											Data wylotu
										</label>
										<FieldInfo label="format daty wylotu">
											Format: DD.MM.RRRR, np. 04.08.2026.
										</FieldInfo>
									</div>
									<PolishPicker
										id="departure-date"
										name="departureLocalDate"
										label="Data wylotu"
										type="date"
										value={departureDateInput}
										onChange={(value) => {
											setDepartureDateInput(value);
											setFieldErrors((current) => ({ ...current, departureLocalDate: undefined }));
										}}
										invalid={Boolean(fieldErrors.departureLocalDate)}
										describedBy={
											fieldErrors.departureLocalDate ? "departure-date-error" : undefined
										}
									/>
									{fieldErrors.departureLocalDate ? (
										<p id="departure-date-error" className="mt-2 text-sm text-destructive">
											{fieldErrors.departureLocalDate}
										</p>
									) : null}
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
					<PlannerResults
						error={error}
						result={result}
						manualArrival={manualArrival}
						manualArrivalError={manualArrivalError}
						loading={loading}
						destination={destination}
						onManualArrivalChange={(value) => {
							setManualArrival(value);
							setManualArrivalError("");
						}}
						onManualSubmit={submitManual}
						onRetry={() => submitLookup()}
						onDestinationChange={setDestination}
					/>
				</section>

				<p className="mt-8 text-center text-pretty text-sm text-muted-foreground">
					Lot → cel w Mediolanie → maksymalnie 3 warianty przejazdu
				</p>
			</main>
		</div>
	);
}
