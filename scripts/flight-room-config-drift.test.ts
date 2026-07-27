import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function stripJsoncComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

interface RoomEnvironmentConfig {
	durable_objects?: {
		bindings?: Array<{ name?: string; class_name?: string }>;
	};
	migrations?: Array<{ tag?: string; new_sqlite_classes?: string[] }>;
}

interface DataServiceConfig {
	env?: Record<string, RoomEnvironmentConfig>;
}

describe("flight room Durable Object configuration drift", () => {
	const configPath = "apps/data-service/wrangler.jsonc";
	const config = JSON.parse(
		stripJsoncComments(readFileSync(configPath, "utf8")),
	) as DataServiceConfig;

	it.each([
		"dev",
		"staging",
		"production",
	])("registers the binding and SQLite namespace migration in %s", (environment) => {
		const env = config.env?.[environment];
		expect(env?.durable_objects?.bindings).toContainEqual({
			name: "FLIGHT_ROOM",
			class_name: "FlightRoomDurableObject",
		});
		expect(env?.migrations).toContainEqual({
			tag: "flight-room-v1",
			new_sqlite_classes: ["FlightRoomDurableObject"],
		});
	});

	it("keeps the generated Worker type aligned with the binding and exported class", () => {
		const generatedTypes = readFileSync("apps/data-service/worker-configuration.d.ts", "utf8");
		expect(generatedTypes).toContain(
			'FLIGHT_ROOM: DurableObjectNamespace<import("./src/index").FlightRoomDurableObject>',
		);
		expect(generatedTypes).toContain('durableNamespaces: "FlightRoomDurableObject"');
	});

	it("keeps the room table in every Drizzle environment and the generated migration", () => {
		for (const environment of ["dev", "staging", "production"]) {
			expect(readFileSync(`packages/data-ops/drizzle-${environment}.config.ts`, "utf8")).toContain(
				'"./src/room/table.ts"',
			);
		}
		const migration = readFileSync(
			"packages/data-ops/src/drizzle/migrations/dev/0006_great_dragon_lord.sql",
			"utf8",
		);
		for (const table of [
			"flight_rooms",
			"room_memberships",
			"room_selections",
			"room_messages",
			"room_connection_tickets",
		]) {
			expect(migration).toContain(`CREATE TABLE "${table}"`);
		}
	});
});
