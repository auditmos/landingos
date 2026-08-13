import { PGlite } from "@electric-sql/pglite";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/pglite";
import {
	auth_account,
	auth_rate_limit,
	auth_session,
	auth_user,
	auth_verification,
} from "@/drizzle/auth-schema";
import { createBetterAuth } from "./setup";

const TEST_SECRET = "landingos-test-secret-at-least-32-characters";

type SentOtp = {
	email: string;
	otp: string;
	type: string;
};

/**
 * The memory adapter resolves a `createdAt` tie toward the older row, which is
 * what made #22 visible. Postgres orders on microseconds and breaks ties
 * arbitrarily, so it hides the same defect behind clock resolution — hence this
 * second harness: the OTP supersession invariant has to hold on the adapter
 * that actually runs in staging and production.
 */
async function createPostgresAuth(sent: SentOtp[]) {
	const client = new PGlite();
	await client.exec(`
		CREATE TABLE auth_user (
			id text PRIMARY KEY,
			name text NOT NULL,
			email text NOT NULL UNIQUE,
			email_verified boolean DEFAULT false NOT NULL,
			image text,
			created_at timestamp DEFAULT now() NOT NULL,
			updated_at timestamp DEFAULT now() NOT NULL,
			pseudonym text,
			marketing_consent_granted boolean DEFAULT false NOT NULL,
			marketing_consent_policy_version text,
			marketing_consent_updated_at timestamp,
			role text DEFAULT 'user' NOT NULL
		);
		CREATE TABLE auth_session (
			id text PRIMARY KEY,
			expires_at timestamp NOT NULL,
			token text NOT NULL UNIQUE,
			created_at timestamp DEFAULT now() NOT NULL,
			updated_at timestamp DEFAULT now() NOT NULL,
			ip_address text,
			user_agent text,
			user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
		);
		CREATE TABLE auth_account (
			id text PRIMARY KEY,
			account_id text NOT NULL,
			provider_id text NOT NULL,
			user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
			access_token text,
			refresh_token text,
			id_token text,
			access_token_expires_at timestamp,
			refresh_token_expires_at timestamp,
			scope text,
			password text,
			created_at timestamp DEFAULT now() NOT NULL,
			updated_at timestamp DEFAULT now() NOT NULL
		);
		CREATE TABLE auth_verification (
			id text PRIMARY KEY,
			identifier text NOT NULL,
			value text NOT NULL,
			expires_at timestamp NOT NULL,
			created_at timestamp DEFAULT now() NOT NULL,
			updated_at timestamp DEFAULT now() NOT NULL
		);
		CREATE TABLE auth_rate_limit (
			id text PRIMARY KEY,
			key text NOT NULL UNIQUE,
			count integer NOT NULL,
			last_request bigint NOT NULL
		);
	`);
	let nextOtp = 100_000;
	const auth = createBetterAuth({
		database: drizzleAdapter(drizzle(client), {
			provider: "pg",
			schema: {
				auth_user,
				auth_account,
				auth_session,
				auth_verification,
				auth_rate_limit,
			},
		}),
		secret: TEST_SECRET,
		baseURL: "http://localhost:3000",
		sendVerificationOTP: async (message) => {
			sent.push(message);
		},
		generateOTP: () => String(nextOtp++),
	});
	return { client, auth };
}

function authRequest(
	auth: Awaited<ReturnType<typeof createPostgresAuth>>["auth"],
	path: string,
	body: Record<string, unknown>,
	ip: string,
) {
	return auth.handler(
		new Request(`http://localhost:3000/api/auth${path}`, {
			method: "POST",
			headers: new Headers({ "content-type": "application/json", "x-forwarded-for": ip }),
			body: JSON.stringify(body),
		}),
	);
}

async function countRows(client: PGlite, table: string) {
	const result = await client.query<{ count: string }>(
		`SELECT count(*)::text AS count FROM ${table}`,
	);
	return Number(result.rows[0]?.count ?? "-1");
}

describe("LandingOS Better Auth email OTP on Postgres", () => {
	it("accepts only the latest unexpired code", async () => {
		const sent: SentOtp[] = [];
		const { client, auth } = await createPostgresAuth(sent);
		try {
			const body = { email: "latest@example.com", type: "sign-in" };
			expect(
				(await authRequest(auth, "/email-otp/send-verification-otp", body, "203.0.113.1")).status,
			).toBe(200);
			expect(
				(await authRequest(auth, "/email-otp/send-verification-otp", body, "203.0.113.2")).status,
			).toBe(200);
			const [superseded, latest] = sent;

			// A resend supersedes by deletion, not by out-ranking: only one live
			// code may exist per identifier, so which row Postgres returns for
			// equal `created_at` values can never decide whether a stale OTP works.
			expect(await countRows(client, "auth_verification")).toBe(1);
			await client.query(
				"UPDATE auth_verification SET created_at = timestamp '2020-01-01 00:00:00'",
			);

			const oldResponse = await authRequest(
				auth,
				"/sign-in/email-otp",
				{ email: "latest@example.com", otp: superseded?.otp ?? "" },
				"203.0.113.3",
			);
			expect(oldResponse.status).toBe(400);
			expect(await countRows(client, "auth_session")).toBe(0);

			const latestResponse = await authRequest(
				auth,
				"/sign-in/email-otp",
				{ email: "latest@example.com", otp: latest?.otp ?? "" },
				"203.0.113.4",
			);
			expect(latestResponse.status).toBe(200);
			expect(await countRows(client, "auth_session")).toBe(1);
		} finally {
			await client.close();
		}
	});
});
