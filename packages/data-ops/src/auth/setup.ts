import { type BetterAuthOptions, betterAuth } from "better-auth";
import { bearer, captcha, type EmailOTPOptions, emailOTP } from "better-auth/plugins";

export const ACCOUNT_DELETE_FRESH_AGE_SECONDS = 5 * 60;

export const createBetterAuth = (config: {
	database: BetterAuthOptions["database"];
	secret?: BetterAuthOptions["secret"];
	baseURL?: BetterAuthOptions["baseURL"];
	crossSubDomainCookieDomain?: string;
	sendVerificationOTP: EmailOTPOptions["sendVerificationOTP"];
	generateOTP?: EmailOTPOptions["generateOTP"];
	/**
	 * Cloudflare Turnstile bot protection for the email-OTP endpoints. Omit to
	 * disable (local dev / CI / session-only auth instances). When provided, the
	 * captcha plugin rejects protected requests that lack a valid token.
	 */
	captcha?: { secretKey: string; endpoints?: string[] };
	beforeDeleteUser?: (user: { id: string; email: string }, request?: Request) => Promise<void>;
}) => {
	const emailOTPOptions: EmailOTPOptions = {
		sendVerificationOTP: config.sendVerificationOTP,
		otpLength: 6,
		expiresIn: 5 * 60,
		allowedAttempts: 3,
		storeOTP: "hashed",
		resendStrategy: "rotate",
		rateLimit: {
			window: 60,
			max: 3,
		},
	};
	// Better Auth spreads caller options over its built-in defaults, so an
	// explicit `generateOTP: undefined` would clobber the default generator and
	// crash at runtime ("opts.generateOTP is not a function"). Only set the key
	// when a real override function is provided.
	if (config.generateOTP) {
		emailOTPOptions.generateOTP = config.generateOTP;
	}

	// Cloudflare Turnstile bot protection. Only enabled when a secret key is
	// provided — callers that run without live credentials (local dev, CI, the
	// data-service session-only auth instance) simply omit `captcha` and the
	// email-OTP endpoints stay open. Production must supply the secret; that
	// fail-closed gate lives at the call site (see user-application/server.ts).
	const plugins: NonNullable<BetterAuthOptions["plugins"]> = [emailOTP(emailOTPOptions), bearer()];
	if (config.captcha) {
		plugins.push(
			captcha({
				provider: "cloudflare-turnstile",
				secretKey: config.captcha.secretKey,
				// The only bot-abusable OTP entry point: sending a code triggers an
				// email. The verify step is already gated by the 6-digit code + the
				// emailOTP `allowedAttempts` limit, so it does not need a challenge.
				endpoints: config.captcha.endpoints ?? ["/email-otp/send-verification-otp"],
			}),
		);
	}

	return betterAuth({
		database: config.database,
		secret: config.secret,
		baseURL: config.baseURL,
		plugins,
		rateLimit: {
			enabled: true,
			storage: "database",
			modelName: "auth_rate_limit",
		},
		advanced: config.crossSubDomainCookieDomain
			? {
					crossSubDomainCookies: {
						enabled: true,
						domain: config.crossSubDomainCookieDomain,
					},
				}
			: undefined,
		user: {
			modelName: "auth_user",
			deleteUser: {
				enabled: true,
				beforeDelete: async (user, request) => {
					await config.beforeDeleteUser?.(user, request);
				},
			},
			additionalFields: {
				pseudonym: {
					type: "string",
					required: false,
					input: false,
					returned: false,
				},
				marketingConsentGranted: {
					type: "boolean",
					required: true,
					defaultValue: false,
					input: false,
					returned: false,
				},
				marketingConsentPolicyVersion: {
					type: "string",
					required: false,
					input: false,
					returned: false,
				},
				marketingConsentUpdatedAt: {
					type: "date",
					required: false,
					input: false,
					returned: false,
				},
				role: {
					type: "string",
					required: true,
					defaultValue: "user",
					input: false,
					returned: false,
				},
			},
		},
		session: {
			modelName: "auth_session",
			freshAge: ACCOUNT_DELETE_FRESH_AGE_SECONDS,
		},
		verification: {
			modelName: "auth_verification",
		},
		account: {
			modelName: "auth_account",
		},
	});
};
