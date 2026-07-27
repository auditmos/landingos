import type { EmailOTPOptions } from "better-auth/plugins";

const SIX_DIGIT_OTP = /^\d{6}$/;

export function createCloudflareOtpSender(
	binding: Cloudflare.Env["AUTH_EMAIL"],
	from: string,
): EmailOTPOptions["sendVerificationOTP"] {
	const sender = from.trim();
	if (!sender) {
		throw new Error("AUTH_EMAIL_FROM is required");
	}

	return async ({ email, otp, type }) => {
		if (type !== "sign-in" || !SIX_DIGIT_OTP.test(otp)) {
			throw new Error("Invalid LandingOS sign-in OTP");
		}
		await binding.send({
			from: sender,
			to: email,
			subject: "Kod logowania do LandingOS",
			text: `Twój kod logowania do LandingOS: ${otp}\n\nKod wygaśnie za 5 minut. Jeśli to nie Ty, zignoruj tę wiadomość.`,
			html: `<p>Twój kod logowania do LandingOS:</p><p><strong>${otp}</strong></p><p>Kod wygaśnie za 5 minut. Jeśli to nie Ty, zignoruj tę wiadomość.</p>`,
		});
	};
}
