/// <reference types="node" />
import { sql } from "drizzle-orm";
import { seedTransferCatalog } from "../../journey/queries";
import { initDatabase } from "../setup";

async function seedDb() {
	const host = process.env.DATABASE_HOST;
	const username = process.env.DATABASE_USERNAME;
	const password = process.env.DATABASE_PASSWORD;

	if (!host || !username || !password) {
		throw new Error("Missing required DATABASE_* environment variables");
	}

	const db = initDatabase({ host, username, password });
	await db.execute(sql`SELECT 1`);
	await seedTransferCatalog(db);

	process.exit(0);
}

seedDb().catch((_error) => {
	process.exit(1);
});
