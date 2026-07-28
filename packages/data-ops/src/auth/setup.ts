import { type BetterAuthOptions, betterAuth } from "better-auth";
import { bearer, type EmailOTPOptions, emailOTP } from "better-auth/plugins";

export const ACCOUNT_DELETE_FRESH_AGE_SECONDS = 5 * 60;

export const createBetterAuth = (config: {
	database: BetterAuthOptions["database"];
	secret?: BetterAuthOptions["secret"];
	baseURL?: BetterAuthOptions["baseURL"];
	crossSubDomainCookieDomain?: string;
	sendVerificationOTP: EmailOTPOptions["sendVerificationOTP"];
	generateOTP?: EmailOTPOptions["generateOTP"];
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

	return betterAuth({
		database: config.database,
		secret: config.secret,
		baseURL: config.baseURL,
		plugins: [emailOTP(emailOTPOptions), bearer()],
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
