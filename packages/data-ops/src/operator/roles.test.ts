import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getUserRoleById, setOperatorRole } from "./roles";

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
		db: drizzle(client) as unknown as Parameters<typeof setOperatorRole>[0],
	};
}

async function insertUser(client: PGlite, id: string, email: string, role = "user") {
	await client.query("INSERT INTO auth_user (id, name, email, role) VALUES ($1, $2, $3, $4)", [
		id,
		"",
		email,
		role,
	]);
}

describe("operator role administration", () => {
	it("normalizes email and makes grant/revoke idempotent", async () => {
		const { client, db } = await createTestDatabase();
		try {
			await insertUser(client, "user-1", "Operator@Example.com");
			expect(await setOperatorRole(db, "  OPERATOR@example.COM ", "grant")).toEqual({
				status: "changed",
				userId: "user-1",
				role: "operator",
			});
			expect(await setOperatorRole(db, "operator@example.com", "grant")).toEqual({
				status: "unchanged",
				userId: "user-1",
				role: "operator",
			});
			expect(await getUserRoleById(db, "user-1")).toBe("operator");
			expect(await setOperatorRole(db, "operator@example.com", "revoke")).toMatchObject({
				status: "changed",
				role: "user",
			});
			expect(await setOperatorRole(db, "operator@example.com", "revoke")).toMatchObject({
				status: "unchanged",
				role: "user",
			});
		} finally {
			await client.close();
		}
	});

	it("rejects invalid, missing, and case-insensitively ambiguous email targets", async () => {
		const { client, db } = await createTestDatabase();
		try {
			await expect(setOperatorRole(db, "not-an-email", "grant")).rejects.toThrow(
				"Nieprawidłowy adres e-mail",
			);
			await expect(setOperatorRole(db, "missing@example.com", "grant")).rejects.toThrow(
				"Nie znaleziono użytkownika",
			);
			await insertUser(client, "user-1", "Same@example.com");
			await insertUser(client, "user-2", "same@example.com");
			await expect(setOperatorRole(db, "SAME@example.com", "grant")).rejects.toThrow(
				"Niejednoznaczny adres e-mail",
			);
		} finally {
			await client.close();
		}
	});
});
