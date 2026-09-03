import {
	type FlightLookupRequest,
	FlightLookupRequestSchema,
	type FlightResolveResult,
	parseFlightDesignator,
} from "@repo/data-ops/flight";
import { ArrowRight, MessageCircle, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileHandle } from "@/components/auth/turnstile";
import { type FlightLookupState, PlannerResults } from "@/components/flight/flight-planner-results";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { FieldInfo, PolishPicker } from "@/components/ui/field-controls";
import { Input } from "@/components/ui/input";
import { completeManualFlightApi, resolveFlightApi } from "@/lib/flight-planner";
import {
	currentDateInPoland,
	formatPolishDateTimeInput,
	romeLocalDateTimeToUtc,
} from "@/lib/polish-date";

export { FlightSummary } from "@/components/flight/flight-planner-results";

type FieldErrors = Partial<Record<"flightNumber" | "departureLocalDate", string>>;

/** Hero destinations in the Polish locative ("w …"). Only Milan is live today. */
const HERO_DESTINATIONS = [
	{ city: "Mediolanie", available: true },
	{ city: "Madrycie", available: false },
	{ city: "Paryżu", available: false },
	{ city: "Rzymie", available: false },
	{ city: "Barcelonie", available: false },
] as const;

const DESTINATION_ROTATION_MS = 2600;

/**
 * Cycles the hero destination through upcoming cities as a teaser. Milan — the
 * only city that actually works today — is the one tinted with the primary
 * color; the others render in the plain heading color.
 */
function RotatingDestination() {
	const [index, setIndex] = useState(0);

	useEffect(() => {
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
		const interval = setInterval(() => {
			setIndex((current) => (current + 1) % HERO_DESTINATIONS.length);
		}, DESTINATION_ROTATION_MS);
		return () => clearInterval(interval);
	}, []);

	const destination = HERO_DESTINATIONS[index % HERO_DESTINATIONS.length] ?? HERO_DESTINATIONS[0];

	return (
		// Remounting on city change restarts the fade-in animation.
		<span
			key={destination.city}
			className={
				destination.available
					? "inline-block animate-destination-in text-primary motion-reduce:animate-none"
					: "inline-block animate-destination-in motion-reduce:animate-none"
			}
		>
			{destination.city}
		</span>
	);
}
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

export function FlightPlanner({ initialFlightNumber = "" }: { initialFlightNumber?: string }) {
	const [flightNumber, setFlightNumber] = useState(initialFlightNumber);
	const [departureDateInput, setDepartureDateInput] = useState(currentDateInPoland);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	const [lookup, setLookup] = useState<FlightLookupState>({ phase: "idle" });
	const [manualArrival, setManualArrival] = useState("");
	const [manualArrivalError, setManualArrivalError] = useState("");
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);
	// Identity of the current resolution, not rendered state: it keys the
	// destination stage so two consecutive lookups never share one.
	const resolutionCount = useRef(0);
	const busy =
		lookup.phase === "loading" || (lookup.phase === "resolved" && lookup.manualPending === true);
	const captchaRef = useRef<TurnstileHandle>(null);
	const captchaRequired = Boolean(TURNSTILE_SITE_KEY);
	const resultsRef = useRef<HTMLElement>(null);
	const designatorPreview = parseFlightDesignator(flightNumber);
	const flightNumberDescribedBy = [
		"flight-number-help",
		designatorPreview.status === "recognized" ? "flight-number-preview" : undefined,
		fieldErrors.flightNumber ? "flight-number-error" : undefined,
	]
		.filter(Boolean)
		.join(" ");

	// Once a lookup resolves (or errors), bring the results into view so the answer
	// is visible without scrolling — on mobile the form fills the first screen.
	const outcomeKey = lookup.phase === "resolved" ? `resolved:${lookup.attempt}` : lookup.phase;
	useEffect(() => {
		if (outcomeKey === "idle" || outcomeKey === "loading") return;
		const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		resultsRef.current?.scrollIntoView?.({
			behavior: reduceMotion ? "auto" : "smooth",
			block: "start",
		});
	}, [outcomeKey]);

	// Turnstile tokens are single-use — drop the current one and re-run the widget
	// so the next lookup has a fresh token ready. No-op when the challenge is off.
	function refreshCaptcha() {
		setCaptchaToken(null);
		captchaRef.current?.reset();
	}

	function applyLookupResult(next: FlightResolveResult) {
		resolutionCount.current += 1;
		setLookup({ phase: "resolved", attempt: resolutionCount.current, result: next });
		if (next.status === "manual_required") {
			setManualArrival("");
			setManualArrivalError("");
		}
	}

	async function submitLookup(event?: FormEvent) {
		event?.preventDefault();
		// A previous failure is not evidence about the lookup about to run.
		setLookup((current) => (current.phase === "failed" ? { phase: "idle" } : current));
		const parsed = parseLookupForm(flightNumber, departureDateInput);
		if (parsed.errors) {
			setFieldErrors(parsed.errors);
			return;
		}
		if (captchaRequired && !captchaToken) {
			setLookup({ phase: "failed", message: "Potwierdź, że nie jesteś robotem." });
			return;
		}
		setFieldErrors({});
		setFlightNumber(parsed.input.flightNumber);
		setDepartureDateInput(parsed.input.departureLocalDate);
		setLookup({ phase: "loading" });
		try {
			applyLookupResult(await resolveFlightApi(parsed.input, fetch, captchaToken ?? undefined));
		} catch (caught) {
			setLookup({
				phase: "failed",
				message: caught instanceof Error ? caught.message : "Nie udało się sprawdzić lotu.",
			});
		} finally {
			refreshCaptcha();
		}
	}

	async function submitManual(event: FormEvent) {
		event.preventDefault();
		if (lookup.phase !== "resolved" || lookup.result.status !== "manual_required") return;
		const pending = lookup.result;
		const manualArrivalUtc = romeLocalDateTimeToUtc(manualArrival);
		if (!formatPolishDateTimeInput(manualArrival) || !manualArrivalUtc) {
			setManualArrivalError("Podaj prawidłową datę i godzinę w formacie DD.MM.RRRR, GG:MM.");
			return;
		}
		setManualArrivalError("");
		setLookup((current) =>
			current.phase === "resolved"
				? { ...current, manualPending: true, manualError: undefined }
				: current,
		);
		try {
			applyLookupResult(
				await completeManualFlightApi({
					flightNumber: pending.flightNumber,
					departureLocalDate: pending.departureLocalDate,
					destinationIata: "BGY",
					scheduledArrivalUtc: manualArrivalUtc,
				}),
			);
		} catch (caught) {
			// The manual card stays: the failure belongs to this resolution, not
			// to a new one, so the traveler keeps the form they were filling in.
			setLookup((current) =>
				current.phase === "resolved"
					? {
							...current,
							manualPending: false,
							manualError:
								caught instanceof Error
									? caught.message
									: "Nie udało się zapisać godziny przylotu.",
						}
					: current,
			);
		}
	}

	return (
		<div className="flex min-h-dvh flex-col bg-background text-foreground">
			<header className="border-b border-border">
				<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
					<a className="flex items-center gap-3" href="/" aria-label="LandingOS — strona główna">
						<img src="/landingos-icon.svg" alt="" className="size-9" width="36" height="36" />
						<span className="text-lg font-bold text-foreground">LandingOS</span>
					</a>
					<div className="flex items-center gap-2 sm:gap-4">
						{/* Way back into the signed-in area: someone who leaves a flight room by
						    accident has no other clue that /app is where their rooms live. */}
						<Button asChild variant="outline" size="sm" className="font-bold">
							<a href="/app">
								<MessageCircle className="size-4" aria-hidden="true" />
								Pokoje lotu
							</a>
						</Button>
						<ThemeToggle />
					</div>
				</div>
			</header>

			<main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
				<div className="grid items-start gap-10 py-10 sm:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-20">
					<section aria-labelledby="hero-title">
						<p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-bold uppercase text-foreground">
							<span className="size-2 rounded-full bg-primary" aria-hidden="true" />
							Lot · przejazd · pokój lotu
						</p>
						<h1
							id="hero-title"
							className="mt-6 max-w-xl text-balance font-serif text-5xl font-medium leading-[0.95] text-foreground sm:text-6xl lg:text-7xl"
						>
							Z lotniska prosto do celu <span className="sr-only">w Mediolanie</span>
							<span aria-hidden="true" className="block">
								w <RotatingDestination />
							</span>
						</h1>
						<p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
							Podaj numer lotu i datę wylotu. Dopasujemy czas przylotu, a potem pokażemy maksymalnie
							trzy sensowne warianty przejazdu.
						</p>
						{/* Route board: one corridor is live today, the rest are on the way —
						    a status pair instead of a sentence, so the split is legible at a glance. */}
						<div className="mt-6 flex flex-wrap items-stretch gap-3">
							<p className="flex items-center gap-3 border border-foreground bg-card px-4 py-2.5 shadow-press-sm">
								<span className="relative flex size-2.5" aria-hidden="true">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75 motion-reduce:hidden" />
									<span className="relative inline-flex size-2.5 rounded-full bg-success" />
								</span>
								<span>
									<span className="block text-[10px] font-extrabold uppercase tracking-wider text-success">
										Dostępne teraz
									</span>
									<span className="block text-xs font-bold uppercase text-foreground">
										Polska
										<span className="px-1.5 text-primary" aria-hidden="true">
											→
										</span>
										BGY
										<span className="px-1.5 text-primary" aria-hidden="true">
											→
										</span>
										Mediolan
									</span>
								</span>
							</p>
							<p className="flex items-center gap-3 border border-dashed border-border px-4 py-2.5">
								<Sparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
								<span>
									<span className="block text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
										Kolejne kierunki wkrótce
									</span>
									<span className="block text-xs font-bold uppercase text-muted-foreground">
										Madryt · Paryż · Rzym…
									</span>
								</span>
							</p>
						</div>

						<ol
							className="mt-10 grid list-none border-t border-border sm:mt-12 sm:grid-cols-3"
							aria-label="Jak działa LandingOS"
						>
							<li className="flex items-baseline gap-4 border-b border-border py-4 sm:block sm:border-b-0 sm:py-0 sm:pt-4 sm:pr-5">
								<span className="text-xs font-extrabold tabular-nums text-primary">01</span>
								<p className="text-pretty text-sm font-semibold leading-snug text-foreground sm:mt-2">
									Wpisujesz lot i cel w Mediolanie.
								</p>
							</li>
							<li className="flex items-baseline gap-4 border-b border-border py-4 sm:block sm:border-b-0 sm:border-l sm:px-5 sm:py-0 sm:pt-4">
								<span className="text-xs font-extrabold tabular-nums text-primary">02</span>
								<p className="text-pretty text-sm font-semibold leading-snug text-foreground sm:mt-2">
									Porównujesz czytelne warianty dojazdu.
								</p>
							</li>
							<li className="flex items-baseline gap-4 py-4 sm:block sm:border-l sm:border-border sm:py-0 sm:pt-4 sm:pl-5">
								<span className="text-xs font-extrabold tabular-nums text-primary">03</span>
								<p className="text-pretty text-sm font-semibold leading-snug text-foreground sm:mt-2">
									Łączysz się z osobami z tego samego lotu.
								</p>
							</li>
						</ol>
					</section>

					<section aria-labelledby="flight-lookup-title">
						<div className="border border-foreground bg-card shadow-press">
							<div className="flex items-center justify-between gap-4 border-b border-foreground px-5 py-4 sm:px-7">
								<h2
									id="flight-lookup-title"
									className="text-balance text-lg font-bold text-foreground"
								>
									Znajdź swój lot
								</h2>
								<p className="text-xs font-bold uppercase text-muted-foreground">Etap 1 z 3</p>
							</div>
							<div className="px-5 py-6 sm:px-7 sm:py-7">
								<p className="text-pretty text-sm leading-relaxed text-muted-foreground">
									Numer lotu znajdziesz na bilecie lub karcie pokładowej.
								</p>

								<form className="mt-6 space-y-5" onSubmit={submitLookup} noValidate>
									<div>
										<div className="mb-2 flex items-center gap-1">
											<label
												className="text-sm font-semibold text-foreground"
												htmlFor="flight-number"
											>
												Numer lotu
											</label>
											<FieldInfo label="format numeru lotu">
												Format: kod przewoźnika i od 1 do 4 cyfr, np. W6 1431 lub FR1234.
											</FieldInfo>
										</div>
										<Input
											id="flight-number"
											name="flightNumber"
											placeholder="W6 1431 lub FR1234"
											autoComplete="off"
											autoCapitalize="characters"
											spellCheck={false}
											maxLength={16}
											value={flightNumber}
											onChange={(event) => {
												setFlightNumber(event.target.value);
												setFieldErrors((current) => ({ ...current, flightNumber: undefined }));
											}}
											onBlur={() => {
												if (designatorPreview.status === "recognized") {
													setFlightNumber(designatorPreview.canonical);
												}
											}}
											aria-invalid={Boolean(fieldErrors.flightNumber)}
											aria-describedby={flightNumberDescribedBy}
											className="h-12 bg-background px-4 text-base"
										/>
										<p id="flight-number-help" className="mt-2 text-xs text-muted-foreground">
											Numer lotu z biletu lub karty pokładowej — nie numer rezerwacji.
										</p>
										{designatorPreview.status === "recognized" ? (
											<p
												id="flight-number-preview"
												className="mt-1 text-sm font-medium text-foreground"
												aria-live="polite"
											>
												Rozpoznamy jako {designatorPreview.canonical}
											</p>
										) : null}
										{fieldErrors.flightNumber ? (
											<p id="flight-number-error" className="mt-2 text-sm text-destructive">
												{fieldErrors.flightNumber}
											</p>
										) : null}
									</div>
									<div>
										<div className="mb-2 flex items-center gap-1">
											<label
												className="text-sm font-semibold text-foreground"
												htmlFor="departure-date-native"
											>
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
											allowTyping
											onChange={(value) => {
												setDepartureDateInput(value);
												setFieldErrors((current) => ({
													...current,
													departureLocalDate: undefined,
												}));
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
										className="h-12 w-full text-base font-bold"
										size="lg"
										type="submit"
										disabled={busy || (captchaRequired && !captchaToken)}
									>
										{busy ? "Sprawdzamy lot…" : "Sprawdź lot"}
										{busy ? null : <ArrowRight className="size-4" aria-hidden="true" />}
									</Button>
								</form>
								<p className="mt-5 text-pretty text-center text-xs leading-5 text-muted-foreground">
									Bez konta i bez adresu — dokładny cel nigdy nie trafia do pokoju lotu.
								</p>
							</div>
						</div>
					</section>
				</div>

				<section
					ref={resultsRef}
					className="mx-auto max-w-4xl scroll-mt-6 space-y-5 pb-12"
					aria-label="Wynik planowania lotu"
				>
					<PlannerResults
						state={lookup}
						manualArrival={manualArrival}
						manualArrivalError={manualArrivalError}
						onManualArrivalChange={(value) => {
							setManualArrival(value);
							setManualArrivalError("");
						}}
						onManualSubmit={submitManual}
						onRetry={() => submitLookup()}
						onDestinationChange={(next) =>
							// Only the resolution that owns the destination stage can record
							// a selection — a callback from a superseded one is dropped.
							setLookup((current) =>
								current.phase === "resolved" ? { ...current, destination: next } : current,
							)
						}
					/>
				</section>
			</main>

			<footer className="border-t border-border">
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
					<p className="font-bold text-foreground">
						LandingOS <span aria-hidden="true">·</span> lot, przejazd, pokój lotu
					</p>
					<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-5">
						<p>Kolejne kierunki wkrótce.</p>
						<a
							href="/app"
							className="font-bold text-foreground underline underline-offset-4 hover:text-primary"
						>
							Wróć do swoich pokoi lotu
						</a>
					</div>
				</div>
			</footer>
		</div>
	);
}
