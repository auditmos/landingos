import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
	getIdentityProfile,
	isRoomReady,
	updateMarketingConsent,
	updatePseudonym,
} from "./queries";

async function createTestDatabase() {
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
	`);
	return {
		client,
		db: drizzle(client) as unknown as Parameters<typeof getIdentityProfile>[0],
	};
}

describe("identity profile persistence", () => {
	it("defaults marketing consent to false and does not require a pseudonym to sign in", async () => {
		const { client, db } = await createTestDatabase();
		try {
			await client.query(
				"INSERT INTO auth_user (id, name, email, email_verified) VALUES ($1, $2, $3, $4)",
				["user-1", "", "user@example.com", true],
			);
			const profile = await getIdentityProfile(db, "user-1");
			expect(profile).toMatchObject({
				id: "user-1",
				pseudonym: null,
				marketingConsentGranted: false,
				role: "user",
			});
			expect(isRoomReady(profile)).toBe(false);
		} finally {
			await client.close();
		}
	});

	it("normalizes a valid pseudonym and makes a verified user room-ready", async () => {
		const { client, db } = await createTestDatabase();
		try {
			await client.query(
				"INSERT INTO auth_user (id, name, email, email_verified) VALUES ($1, $2, $3, $4)",
				["user-1", "", "user@example.com", true],
			);
			const profile = await updatePseudonym(db, "user-1", "  Z\u0307aneta  ");
			expect(profile?.pseudonym).toBe("Żaneta");
			expect(isRoomReady(profile)).toBe(true);
		} finally {
			await client.close();
		}
	});

	it("rejects invalid pseudonyms before writing", async () => {
		const { client, db } = await createTestDatabase();
		try {
			await client.query(
				"INSERT INTO auth_user (id, name, email, email_verified) VALUES ($1, $2, $3, $4)",
				["user-1", "", "user@example.com", true],
			);
			await expect(updatePseudonym(db, "user-1", "_x")).rejects.toThrow();
			expect((await getIdentityProfile(db, "user-1"))?.pseudonym).toBeNull();
		} finally {
			await client.close();
		}
	});

	it("records consent policy/time independently and supports withdrawal", async () => {
		const { client, db } = await createTestDatabase();
		try {
			await client.query(
				"INSERT INTO auth_user (id, name, email, email_verified) VALUES ($1, $2, $3, $4)",
				["user-1", "", "user@example.com", true],
			);
			const grantedAt = new Date("2026-07-27T10:00:00.000Z");
			const granted = await updateMarketingConsent(
				db,
				"user-1",
				{ granted: true, policyVersion: "2026-07" },
				grantedAt,
			);
			expect(granted).toMatchObject({
				marketingConsentGranted: true,
				marketingConsentPolicyVersion: "2026-07",
				marketingConsentUpdatedAt: grantedAt,
				role: "user",
			});

			const withdrawnAt = new Date("2026-07-27T11:00:00.000Z");
			const withdrawn = await updateMarketingConsent(db, "user-1", { granted: false }, withdrawnAt);
			expect(withdrawn).toMatchObject({
				marketingConsentGranted: false,
				marketingConsentPolicyVersion: "2026-07",
				marketingConsentUpdatedAt: withdrawnAt,
				role: "user",
			});
		} finally {
			await client.close();
		}
	});
});
