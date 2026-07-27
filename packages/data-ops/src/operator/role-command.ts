/// <reference types="node" />
import { fileURLToPath } from "node:url";
import { initDatabase } from "../database/setup";
import { type OperatorRoleAction, setOperatorRole } from "./roles";

const USAGE = "Użycie: pnpm operator:role:<env> <grant|revoke> <email>";

export function parseOperatorRoleCommand(args: string[]): {
	action: OperatorRoleAction;
	email: string;
} {
	if (
		args.length !== 2 ||
		(args[0] !== "grant" && args[0] !== "revoke") ||
		typeof args[1] !== "string"
	) {
		throw new Error(USAGE);
	}
	return { action: args[0], email: args[1] };
}

export function readOperatorRoleDatabaseCredentials(env: Record<string, string | undefined>): {
	host: string;
	username: string;
	password: string;
} {
	const host = env.DATABASE_HOST;
	const username = env.DATABASE_USERNAME;
	const password = env.DATABASE_PASSWORD;
	if (!host || !username || !password) {
		throw new Error("Brak wymaganych zmiennych DATABASE_HOST/USERNAME/PASSWORD.");
	}
	return { host, username, password };
}

async function run() {
	const { action, email } = parseOperatorRoleCommand(process.argv.slice(2));
	const credentials = readOperatorRoleDatabaseCredentials(process.env);
	const result = await setOperatorRole(initDatabase(credentials), email, action);
	process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	run().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : "Nie udało się zmienić roli.";
		process.stderr.write(`${JSON.stringify({ error: message })}\n`);
		process.exitCode = 1;
	});
}
