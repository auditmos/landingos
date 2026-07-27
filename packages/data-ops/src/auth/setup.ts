import { type BetterAuthOptions, betterAuth } from "better-auth";
import { bearer, type EmailOTPOptions, emailOTP } from "better-auth/plugins";

export const createBetterAuth = (config: {
	database: BetterAuthOptions["database"];
	secret?: BetterAuthOptions["secret"];
	baseURL?: BetterAuthOptions["baseURL"];
	crossSubDomainCookieDomain?: string;
	sendVerificationOTP: EmailOTPOptions["sendVerificationOTP"];
}) => {
	return betterAuth({
		database: config.database,
		secret: config.secret,
		baseURL: config.baseURL,
		plugins: [
			emailOTP({
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
			}),
			bearer(),
		],
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
		},
		verification: {
			modelName: "auth_verification",
		},
		account: {
			modelName: "auth_account",
		},
	});
};
