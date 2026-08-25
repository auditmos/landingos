import { describe, expect, it } from "vitest";
import { isRuntimeSource, matching, source as read, scanFiles } from "./leak-scan";

function stripJsoncComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const analyticsTable = read("packages/data-ops/src/analytics/table.ts");
const analyticsQueries = read("packages/data-ops/src/analytics/queries.ts");
/** The whole server-side ledger surface, swept whole. */
const serverAnalyticsFiles = scanFiles(
	[
		"packages/data-ops/src/analytics",
		"apps/data-service/src/analytics",
		"apps/data-service/src/scheduled",
	],
	{ include: isRuntimeSource },
);
/** The whole browser bundle — the secret must not reach any of it. */
const clientFiles = scanFiles(["apps/user-application/src"], { include: isRuntimeSource });

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
		expect(clientFiles.length).toBeGreaterThan(0);
		expect(serverAnalyticsFiles.length).toBeGreaterThan(0);
		expect(
			matching(
				clientFiles,
				/ANALYTICS_PSEUDONYM_SECRET|actorPseudonym|HMAC|raw-user|internal-user/i,
			),
		).toEqual([]);
		expect(read("apps/data-service/.dev.vars.example")).toContain("ANALYTICS_PSEUDONYM_SECRET=");
		expect(read("apps/user-application/.env.example")).not.toContain("ANALYTICS_PSEUDONYM_SECRET");
		expect(matching(serverAnalyticsFiles, /\bconsole\.(log|info|warn|error)\b/)).toEqual([]);
	});

	it("uses no third-party or Cloudflare Analytics Engine ledger", () => {
		const manifests = scanFiles(["package.json", "packages", "apps"], {
			include: (path) => path.endsWith("package.json"),
		});

		expect(manifests.length).toBeGreaterThan(0);
		expect(matching(manifests, /posthog|segment|mixpanel|amplitude/i)).toEqual([]);
		expect(read("apps/data-service/wrangler.jsonc")).not.toContain("analytics_engine_datasets");
	});

	it("registers one bounded cron in every data-service environment", () => {
		const config = JSON.parse(stripJsoncComments(read("apps/data-service/wrangler.jsonc"))) as {
			env?: Record<string, { triggers?: { crons?: string[] } }>;
		};
		for (const environment of ["dev", "staging", "production"]) {
			expect(config.env?.[environment]?.triggers?.crons).toEqual(["0 * * * *"]);
		}
	});

	it("registers analytics tables in every Drizzle environment and migration", () => {
		for (const environment of ["dev", "staging", "production"]) {
			expect(read(`packages/data-ops/drizzle-${environment}.config.ts`)).toContain(
				'"./src/analytics/table.ts"',
			);
		}
		const migration = read("packages/data-ops/src/drizzle/migrations/dev/0008_normal_ma_gnuci.sql");
		expect(migration).toContain('CREATE TABLE "analytics_funnels"');
		expect(migration).toContain('CREATE TABLE "analytics_events"');
		expect(migration).toContain(
			'CONSTRAINT "analytics_events_funnel_id_event_name_pk" PRIMARY KEY',
		);
	});
});
