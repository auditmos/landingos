import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..", "..");
const readPackageFile = (path: string) => readFileSync(resolve(packageRoot, path), "utf8");

describe("Better Auth schema and migration drift", () => {
	it("contains profile, role, and database-backed rate-limit tables without approved", () => {
		const schema = readPackageFile("src/drizzle/auth-schema.ts");
		expect(schema).toContain('pgTable("auth_rate_limit"');
		expect(schema).toContain("marketingConsentGranted");
		expect(schema).toContain("marketingConsentPolicyVersion");
		expect(schema).toContain("marketingConsentUpdatedAt");
		expect(schema).toContain("pseudonym");
		expect(schema).toContain("role");
		expect(schema).not.toContain("approved");
	});

	it("migrates approval to a fresh false consent field instead of renaming its meaning", () => {
		const migration = readPackageFile("src/drizzle/migrations/dev/0002_pretty_iron_patriot.sql");
		expect(migration).toContain('ADD COLUMN "marketing_consent_granted" boolean DEFAULT false');
		expect(migration).toContain('DROP COLUMN "approved"');
		expect(migration).not.toMatch(/RENAME.+approved/i);
		expect(migration).toContain('CREATE TABLE "auth_rate_limit"');
	});

	it("pins the generator and runs it without injecting database secrets", () => {
		const packageJson = readPackageFile("package.json");
		const config = readPackageFile("config/auth.ts");
		expect(packageJson).toContain("@better-auth/cli@1.4.21");
		expect(packageJson).not.toContain("@better-auth/cli@latest");
		expect(config).toContain("schema-only.invalid");
		expect(config).not.toContain("process.env");
		expect(config).toContain("cannot send email");
	});
});
