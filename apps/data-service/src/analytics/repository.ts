import { ensureActiveAnalyticsFunnel, recordAnalyticsEvent } from "@repo/data-ops/analytics";
import { getDb } from "@repo/data-ops/database/setup";
import { type AnalyticsTracker, createAnalyticsTracker } from "./service";

export function createDatabaseAnalyticsTracker(env: Env): AnalyticsTracker {
	const db = getDb();
	return createAnalyticsTracker({
		now: () => new Date(),
		secret: env.ANALYTICS_PSEUDONYM_SECRET,
		ensureActiveFunnel: (input) => ensureActiveAnalyticsFunnel(db, input),
		recordEvent: (input) => recordAnalyticsEvent(db, input),
	});
}
