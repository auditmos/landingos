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

export function EmailAuth({
	onAuthenticated = completeAuthenticationNavigation,
}: {
	onAuthenticated?: () => void;
}) {
	const [step, setStep] = useState<"email" | "otp">("email");
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [marketingConsent, setMarketingConsent] = useState(false);
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);
	const captchaRef = useRef<TurnstileHandle>(null);

	const normalizedEmail = email.trim().toLowerCase();
	const captchaRequired = Boolean(TURNSTILE_SITE_KEY);

	async function requestCode(event: FormEvent) {
		event.preventDefault();
		setError(null);
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
			setError("Wpisz prawidłowy adres e-mail.");
			return;
		}
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
			setStep("otp");
		} catch {
			setError("Nie udało się wysłać kodu. Spróbuj ponownie za chwilę.");
			// Turnstile tokens are single-use — drop it and re-run before any retry.
			setCaptchaToken(null);
			captchaRef.current?.reset();
		} finally {
			setIsPending(false);
		}
	}

	async function verifyCode(event: FormEvent) {
		event.preventDefault();
		setError(null);
		if (!/^\d{6}$/.test(otp)) {
			setError("Kod ma 6 cyfr.");
			return;
		}
		setIsPending(true);
		try {
			const result = await authClient.signIn.emailOtp({
				email: normalizedEmail,
				otp,
			});
			if (result.error) {
				throw new Error("verify_failed");
			}
			if (marketingConsent) {
				await fetch("/api/profile", {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						action: "marketing_consent",
						granted: true,
						policyVersion: MARKETING_POLICY_VERSION,
					}),
				});
			}
			onAuthenticated();
		} catch {
			setError("Kod jest nieprawidłowy albo wygasł. Poproś o nowy kod.");
		} finally {
			setIsPending(false);
		}
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl font-bold text-foreground">Zaloguj się kodem</CardTitle>
					<CardDescription>
						{step === "email"
							? "Wyślemy jednorazowy kod na Twój adres e-mail."
							: `Jeśli adres ${normalizedEmail} jest prawidłowy, znajdziesz na nim kod.`}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{error ? (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					) : null}

					{step === "email" ? (
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
								disabled={isPending || (captchaRequired && !captchaToken)}
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
									className="mt-1"
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
							<Button
								type="button"
								variant="ghost"
								className="w-full"
								onClick={() => {
									setOtp("");
									setStep("email");
								}}
							>
								Użyj innego adresu
							</Button>
						</form>
					)}
					<p className="text-center text-xs text-muted-foreground">
						Pseudonim ustawisz dopiero przed wejściem do pokoju lotu.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
