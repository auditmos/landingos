import { type FormEvent, useRef, useState } from "react";
import { Turnstile, type TurnstileHandle } from "@/components/auth/turnstile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { completeAuthenticationNavigation } from "@/lib/auth-navigation";

const MARKETING_POLICY_VERSION = "2026-07";
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

/**
 * The phase the sign-in is in, holding exactly the data that phase owns. A
 * captcha token exists only while the email form can spend it, and the address
 * being verified is fixed the moment the code is sent.
 */
type AuthFlow = { step: "email"; captchaToken: string | null } | { step: "otp"; email: string };

/**
 * Consent is deliberately best-effort: the session already exists by the time
 * it runs, and the traveler can grant or withdraw it later from the profile.
 * Every failure — refused connection or 4xx — therefore has one outcome, and
 * none of them can look like a rejected code.
 */
async function saveMarketingConsent(): Promise<void> {
	try {
		const response = await fetch("/api/profile", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				action: "marketing_consent",
				granted: true,
				policyVersion: MARKETING_POLICY_VERSION,
			}),
		});
		if (!response.ok) throw new Error("consent_failed");
	} catch {
		// biome-ignore lint/suspicious/noConsole: the only signal that consent was dropped
		console.warn("Marketing consent was not saved; the traveler can grant it from the profile.");
	}
}

export function EmailAuth({
	onAuthenticated = completeAuthenticationNavigation,
}: {
	onAuthenticated?: () => void;
}) {
	const [flow, setFlow] = useState<AuthFlow>({ step: "email", captchaToken: null });
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [marketingConsent, setMarketingConsent] = useState(false);
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const captchaRef = useRef<TurnstileHandle>(null);

	const normalizedEmail = email.trim().toLowerCase();
	const captchaRequired = Boolean(TURNSTILE_SITE_KEY);

	/** A token belongs to the email phase alone — off it, this is a no-op. */
	function setCaptchaToken(captchaToken: string | null) {
		setFlow((current) => (current.step === "email" ? { ...current, captchaToken } : current));
	}

	/** Turnstile tokens are single-use: a spent one is dropped, never retried. */
	function dropCaptchaToken() {
		setFlow({ step: "email", captchaToken: null });
		captchaRef.current?.reset();
	}

	function toOtp(verifiedEmail: string) {
		setError(null);
		setOtp("");
		setFlow({ step: "otp", email: verifiedEmail });
	}

	function backToEmail() {
		setError(null);
		setOtp("");
		dropCaptchaToken();
	}

	async function requestCode(event: FormEvent) {
		event.preventDefault();
		if (flow.step !== "email") return;
		setError(null);
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
			setError("Wpisz prawidłowy adres e-mail.");
			return;
		}
		const captchaToken = flow.captchaToken;
		if (captchaRequired && !captchaToken) {
			setError("Potwierdź, że nie jesteś robotem.");
			return;
		}
		setIsPending(true);
		try {
			const result = await authClient.emailOtp.sendVerificationOtp({
				email: normalizedEmail,
				type: "sign-in",
				fetchOptions: captchaToken
					? { headers: { "x-captcha-response": captchaToken } }
					: undefined,
			});
			if (result.error) {
				throw new Error("send_failed");
			}
			toOtp(normalizedEmail);
		} catch {
			setError("Nie udało się wysłać kodu. Spróbuj ponownie za chwilę.");
			dropCaptchaToken();
		} finally {
			setIsPending(false);
		}
	}

	async function signInWithCode(verifiedEmail: string): Promise<boolean> {
		try {
			const result = await authClient.signIn.emailOtp({ email: verifiedEmail, otp });
			return !result.error;
		} catch {
			return false;
		}
	}

	async function verifyCode(event: FormEvent) {
		event.preventDefault();
		if (flow.step !== "otp") return;
		setError(null);
		if (!/^\d{6}$/.test(otp)) {
			setError("Kod ma 6 cyfr.");
			return;
		}
		setIsPending(true);
		const signedIn = await signInWithCode(flow.email);
		if (!signedIn) {
			setError("Kod jest nieprawidłowy albo wygasł. Poproś o nowy kod.");
			setIsPending(false);
			return;
		}
		if (marketingConsent) await saveMarketingConsent();
		setIsPending(false);
		onAuthenticated();
	}

	return (
		<div className="min-h-dvh flex flex-col items-center justify-center gap-8 bg-background p-4">
			<a className="flex items-center gap-3" href="/" aria-label="LandingOS — strona główna">
				<img src="/landingos-icon.svg" alt="" className="size-10" width="40" height="40" />
				<span className="text-xl font-bold text-foreground">LandingOS</span>
			</a>
			<Card className="w-full max-w-md rounded-none border-foreground shadow-press">
				<CardHeader className="text-center">
					<CardTitle className="text-balance font-serif text-3xl font-medium text-foreground">
						Zaloguj się kodem
					</CardTitle>
					<CardDescription>
						{flow.step === "email"
							? "Wyślemy jednorazowy kod na Twój adres e-mail."
							: `Jeśli adres ${flow.email} jest prawidłowy, znajdziesz na nim kod.`}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{error ? (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					) : null}

					{flow.step === "email" ? (
						<form onSubmit={requestCode} className="space-y-4">
							<div className="space-y-1">
								<label htmlFor="auth-email" className="text-sm font-medium text-foreground">
									Adres e-mail
								</label>
								<Input
									id="auth-email"
									type="email"
									autoComplete="email"
									placeholder="ty@example.com"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
								/>
							</div>
							{TURNSTILE_SITE_KEY ? (
								<Turnstile
									ref={captchaRef}
									siteKey={TURNSTILE_SITE_KEY}
									action="email-otp"
									className="flex justify-center"
									onVerify={setCaptchaToken}
									onExpire={() => setCaptchaToken(null)}
									onError={() => setCaptchaToken(null)}
								/>
							) : null}
							<Button
								type="submit"
								className="w-full h-12"
								disabled={isPending || (captchaRequired && !flow.captchaToken)}
							>
								{isPending ? "Wysyłanie…" : "Wyślij kod"}
							</Button>
						</form>
					) : (
						<form onSubmit={verifyCode} className="space-y-4">
							<div className="space-y-1">
								<label htmlFor="auth-otp" className="text-sm font-medium text-foreground">
									Kod ma 6 cyfr
								</label>
								<Input
									id="auth-otp"
									inputMode="numeric"
									autoComplete="one-time-code"
									maxLength={6}
									pattern="[0-9]{6}"
									placeholder="000000"
									value={otp}
									onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
								/>
							</div>
							<label className="flex items-start gap-3 text-sm text-muted-foreground">
								<input
									type="checkbox"
									className="mt-1 accent-primary"
									checked={marketingConsent}
									onChange={(event) => setMarketingConsent(event.target.checked)}
								/>
								<span>
									Dobrowolnie wyrażam zgodę marketingową. Zgoda nie jest potrzebna do logowania i
									mogę ją później wycofać.
								</span>
							</label>
							<Button type="submit" className="w-full h-12" disabled={isPending}>
								{isPending ? "Logowanie…" : "Zaloguj się"}
							</Button>
							<Button type="button" variant="ghost" className="w-full" onClick={backToEmail}>
								Użyj innego adresu
							</Button>
						</form>
					)}
					<p className="text-center text-xs text-muted-foreground">
						Pseudonim ustawisz dopiero przed wejściem do pokoju lotu.
					</p>
				</CardContent>
			</Card>
			<p className="text-xs font-bold uppercase text-muted-foreground">
				Polska
				<span className="px-1.5 text-primary" aria-hidden="true">
					→
				</span>
				BGY
				<span className="px-1.5 text-primary" aria-hidden="true">
					→
				</span>
				Mediolan
			</p>
		</div>
	);
}
