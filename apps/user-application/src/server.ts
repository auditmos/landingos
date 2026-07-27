// DO NOT DELETE THIS FILE!!!
// This file is a good smoke test to make sure the custom server entry is working

import { env } from "cloudflare:workers";
import { setAuth } from "@repo/data-ops/auth/server";
import { getDb, initDatabase } from "@repo/data-ops/database/setup";
import { prepareAccountDeletion } from "@repo/data-ops/lifecycle";
import handler from "@tanstack/react-start/server-entry";
import { prepareAndBroadcastAccountDeletion } from "./lib/account-deletion-hook";
import { createCloudflareOtpSender } from "./lib/auth-email";
import { applySecurityHeaders } from "./lib/security-headers";

export default {
	async fetch(request: Request) {
		if (!env.CLOUDFLARE_ENV) {
			throw new Error(
				"CLOUDFLARE_ENV is required — declare it in wrangler.jsonc vars per env block",
			);
		}
		initDatabase({
			host: env.DATABASE_HOST,
			username: env.DATABASE_USERNAME,
			password: env.DATABASE_PASSWORD,
		});

		const optionalEnv = env as unknown as Record<string, string | undefined>;
		setAuth({
			secret: env.BETTER_AUTH_SECRET,
			baseURL: env.BETTER_AUTH_BASE_URL,
			crossSubDomainCookieDomain: optionalEnv.BETTER_AUTH_COOKIE_DOMAIN || undefined,
			sendVerificationOTP: createCloudflareOtpSender(env.AUTH_EMAIL, env.AUTH_EMAIL_FROM),
			beforeDeleteUser: (user) =>
				prepareAndBroadcastAccountDeletion(
					{
						now: () => new Date(),
						prepare: (input) => prepareAccountDeletion(getDb(), input),
						broadcast: (rooms) =>
							env.DATA_SERVICE.fetch(
								new Request("https://data-service/internal/lifecycle/redact-rooms", {
									method: "POST",
									headers: {
										"content-type": "application/json",
										Authorization: `Bearer ${env.DATA_SERVICE_API_TOKEN}`,
									},
									body: JSON.stringify({ rooms }),
								}),
							),
					},
					user.id,
					user.email,
				),
			adapter: {
				drizzleDb: getDb(),
				provider: "pg",
			},
		});

		const response = await handler.fetch(request, {
			context: {
				fromFetch: true,
			},
		});
		return applySecurityHeaders(response);
	},
};
