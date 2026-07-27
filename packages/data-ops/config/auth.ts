// packages/data-ops/config/auth.ts

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createBetterAuth } from "../src/auth/setup";
import { initDatabase } from "../src/database/setup";

export const auth = createBetterAuth({
	database: drizzleAdapter(
		initDatabase({
			password: "schema-only",
			host: "schema-only.invalid",
			username: "schema-only",
		}),
		{ provider: "pg" },
	),
	sendVerificationOTP: async () => {
		throw new Error("Schema generation configuration cannot send email");
	},
});
