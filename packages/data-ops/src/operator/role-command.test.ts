import { parseOperatorRoleCommand, readOperatorRoleDatabaseCredentials } from "./role-command";

describe("non-interactive operator role command", () => {
	it.each([
		[["grant", "operator@example.com"], { action: "grant", email: "operator@example.com" }],
		[["revoke", "OPERATOR@example.com"], { action: "revoke", email: "OPERATOR@example.com" }],
	])("parses %j without prompts", (args, expected) => {
		expect(parseOperatorRoleCommand(args)).toEqual(expected);
	});

	it("rejects invalid argument shapes and actions", () => {
		for (const args of [
			[],
			["grant"],
			["grant", "one@example.com", "extra"],
			["promote", "operator@example.com"],
		]) {
			expect(() => parseOperatorRoleCommand(args)).toThrow("Użycie:");
		}
	});

	it("fails closed unless all database credentials are present", () => {
		expect(() => readOperatorRoleDatabaseCredentials({})).toThrow("DATABASE_HOST");
		expect(
			readOperatorRoleDatabaseCredentials({
				DATABASE_HOST: "database.example/db",
				DATABASE_USERNAME: "operator",
				DATABASE_PASSWORD: "secret",
			}),
		).toEqual({
			host: "database.example/db",
			username: "operator",
			password: "secret",
		});
	});
});
