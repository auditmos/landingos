import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function stripJsoncComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const analyticsTable = readFileSync("packages/data-ops/src/analytics/table.ts", "utf8");
const analyticsQueries = readFileSync("packages/data-ops/src/analytics/queries.ts", "utf8");
const serverAnalyticsSources = [
	"apps/data-service/src/analytics/repository.ts",
	"apps/data-service/src/analytics/service.ts",
	"apps/data-service/src/scheduled/index.ts",
].map((path) => readFileSync(path, "utf8"));
const clientSources = [
	"apps/user-application/src/lib/analytics-funnel.ts",
	"apps/user-application/src/lib/flight-planner.ts",
	"apps/user-application/src/lib/journey-planner.ts",
	"apps/user-application/src/lib/room-api.ts",
].map((path) => readFileSync(path, "utf8"));

describe("analytics privacy and configuration boundary", () => {
	it("keeps the ledger free of arbitrary metadata and forbidden private columns", () => {
		expect(analyticsTable).not.toMatch(
			/\b(jsonb|email|userId|ipAddress|userAgent|address|placeId|coordinates|routeSteps|displayPseudonym|messageContent)\b/i,
		);
		expect(analyticsTable).not.toContain("metadata");
	});

	it("aggregates exclusively from the controlled analytics ledger", () => {
		const reportSource = analyticsQueries.slice(
			analyticsQueries.indexOf("export async function getAnalyticsReport"),
		);
		expect(reportSource).toContain("listAnalyticsEvents(db)");
		expect(reportSource).not.toMatch(
			/roomMessages|roomMemberships|flightInstances|auth_user|destination/i,
		);
	});

	it("keeps the HMAC secret and raw actor IDs out of the browser bundle", () => {
		const clientSource = clientSources.join("\n");
		expect(clientSource).not.toMatch(
			/ANALYTICS_PSEUDONYM_SECRET|actorPseudonym|HMAC|raw-user|internal-user/i,
		);
		expect(readFileSync("apps/data-service/.dev.vars.example", "utf8")).toContain(
			"ANALYTICS_PSEUDONYM_SECRET=",
		);
		expect(readFileSync("apps/user-application/.env.example", "utf8")).not.toContain(
			"ANALYTICS_PSEUDONYM_SECRET",
		);
		expect(serverAnalyticsSources.join("\n")).not.toMatch(/\bconsole\.(log|info|warn|error)\b/);
	});

	it("uses no third-party or Cloudflare Analytics Engine ledger", () => {
		const dependencies = [
			"package.json",
			"packages/data-ops/package.json",
			"apps/data-service/package.json",
			"apps/user-application/package.json",
		]
			.map((path) => readFileSync(path, "utf8"))
			.join("\n");
		expect(dependencies).not.toMatch(/posthog|segment|mixpanel|amplitude/i);
		expect(readFileSync("apps/data-service/wrangler.jsonc", "utf8")).not.toContain(
			"analytics_engine_datasets",
		);
	});

	it("registers one bounded cron in every data-service environment", () => {
		const config = JSON.parse(
			stripJsoncComments(readFileSync("apps/data-service/wrangler.jsonc", "utf8")),
		) as {
			env?: Record<string, { triggers?: { crons?: string[] } }>;
		};
		for (const environment of ["dev", "staging", "production"]) {
			expect(config.env?.[environment]?.triggers?.crons).toEqual(["*/5 * * * *"]);
		}
	});

	it("registers analytics tables in every Drizzle environment and migration", () => {
		for (const environment of ["dev", "staging", "production"]) {
			expect(readFileSync(`packages/data-ops/drizzle-${environment}.config.ts`, "utf8")).toContain(
				'"./src/analytics/table.ts"',
			);
		}
		const migration = readFileSync(
			"packages/data-ops/src/drizzle/migrations/dev/0008_normal_ma_gnuci.sql",
			"utf8",
		);
		expect(migration).toContain('CREATE TABLE "analytics_funnels"');
		expect(migration).toContain('CREATE TABLE "analytics_events"');
		expect(migration).toContain(
			'CONSTRAINT "analytics_events_funnel_id_event_name_pk" PRIMARY KEY',
		);
	});
});
