import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
	ANALYTICS_ABANDONMENT_MS,
	ANALYTICS_SWEEP_BATCH_SIZE,
	type AnalyticsDatabase,
	createFunnelId,
	getAnalyticsReport,
	getFunnelState,
	listAnalyticsEvents,
	recordAnalyticsEvent,
	startAnalyticsFunnel,
	sweepAbandonedFunnels,
} from "./queries";

const FUNNEL_A = "00112233445566778899aabbccddeeff";
const FUNNEL_B = "10112233445566778899aabbccddeeff";
const ACTOR_A = "a".repeat(64);

async function createTestDatabase() {
	const client = new PGlite();
	const migrationDirectory = resolve(import.meta.dirname, "../drizzle/migrations/dev");
	for (const migrationName of readdirSync(migrationDirectory)
		.filter((name) => name.endsWith(".sql"))
		.sort()) {
		await client.exec(readFileSync(resolve(migrationDirectory, migrationName), "utf8"));
	}
	return { client, db: drizzle(client) as unknown as AnalyticsDatabase };
}

function at(minutes: number, milliseconds = 0) {
	return new Date(Date.UTC(2026, 8, 14, 7, minutes, 0, milliseconds));
}

const COMPLETION_EVENTS = [
	"flight_recognized",
	"recommendations_viewed",
	"transport_selected",
	"room_joined",
	"chat_activated",
] as const;

async function seedFunnelAtStep(
	db: AnalyticsDatabase,
	funnelId: string,
	step: (typeof COMPLETION_EVENTS)[number] | null,
) {
	await startAnalyticsFunnel(db, { now: at(0), idFactory: () => funnelId });
	if (!step) return;
	await recordAnalyticsEvent(db, {
		requestedFunnelId: funnelId,
		eventName: step,
		actorPseudonym:
			step === "transport_selected" || step === "room_joined" || step === "chat_activated"
				? ACTOR_A
				: undefined,
		transportKind: step === "transport_selected" ? "shared_taxi" : undefined,
		roomOccupancyBucket: step === "room_joined" ? "one" : undefined,
		now: at(0),
	});
}

async function seedCompletedFunnel(
	db: AnalyticsDatabase,
	funnelId: string,
	actor: string,
	bucket: "one" | "two_to_five",
) {
	await startAnalyticsFunnel(db, { now: at(0), idFactory: () => funnelId });
	for (const [index, eventName] of COMPLETION_EVENTS.entries()) {
		await recordAnalyticsEvent(db, {
			requestedFunnelId: funnelId,
			eventName,
			actorPseudonym: index >= 2 ? actor : undefined,
			transportKind: eventName === "transport_selected" ? "public_transport" : undefined,
			roomOccupancyBucket: eventName === "room_joined" ? bucket : undefined,
			now: at(index + 1),
		});
	}
}

describe("analytics event ledger", () => {
	it("creates the full funnel exactly once and keeps first selection/message semantics", async () => {
		const { client, db } = await createTestDatabase();
		try {
			expect(createFunnelId((bytes) => bytes.fill(0xab))).toBe("ab".repeat(16));
			await startAnalyticsFunnel(db, { now: at(0), idFactory: () => FUNNEL_A });
			await recordAnalyticsEvent(db, {
				requestedFunnelId: FUNNEL_A,
				eventName: "flight_recognized",
				now: at(1),
			});
			await recordAnalyticsEvent(db, {
				requestedFunnelId: FUNNEL_A,
				eventName: "flight_recognized",
				now: at(2),
			});
			await recordAnalyticsEvent(db, {
				requestedFunnelId: FUNNEL_A,
				eventName: "recommendations_viewed",
				now: at(3),
			});
			await recordAnalyticsEvent(db, {
				requestedFunnelId: FUNNEL_A,
				eventName: "transport_selected",
				actorPseudonym: ACTOR_A,
				transportKind: "public_transport",
				now: at(4),
			});
			await recordAnalyticsEvent(db, {
				requestedFunnelId: FUNNEL_A,
				eventName: "transport_selected",
				actorPseudonym: ACTOR_A,
				transportKind: "shared_taxi",
				now: at(5),
			});
			await recordAnalyticsEvent(db, {
				requestedFunnelId: FUNNEL_A,
				eventName: "room_joined",
				actorPseudonym: ACTOR_A,
				roomOccupancyBucket: "two_to_five",
				now: at(6),
			});
			await recordAnalyticsEvent(db, {
				requestedFunnelId: FUNNEL_A,
				eventName: "chat_activated",
				actorPseudonym: ACTOR_A,
				now: at(7),
			});
			await recordAnalyticsEvent(db, {
				requestedFunnelId: FUNNEL_A,
				eventName: "chat_activated",
				actorPseudonym: ACTOR_A,
				now: at(8),
			});

			const events = await listAnalyticsEvents(db, FUNNEL_A);
			expect(events.map((item) => item.eventName)).toEqual([
				"funnel_started",
				"flight_recognized",
				"recommendations_viewed",
				"transport_selected",
				"room_joined",
				"chat_activated",
			]);
			expect(events.find((item) => item.eventName === "transport_selected")).toMatchObject({
				transportKind: "public_transport",
				actorPseudonym: ACTOR_A,
			});
			expect(await getFunnelState(db, FUNNEL_A)).toMatchObject({
				status: "completed",
				lastCompletedStep: "chat_activated",
			});
		} finally {
			await client.close();
		}
	});

	it("abandons every incomplete step at the exact boundary in retry-safe bounded batches", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const funnelIds = Array.from({ length: 5 }, (_, index) => `${index + 2}`.padStart(32, "0"));
			const steps = [
				null,
				"flight_recognized",
				"recommendations_viewed",
				"transport_selected",
				"room_joined",
			] as const;
			for (const [index, funnelId] of funnelIds.entries()) {
				await seedFunnelAtStep(db, funnelId, steps[index] ?? null);
			}
			await seedFunnelAtStep(db, FUNNEL_A, "chat_activated");

			expect(
				await sweepAbandonedFunnels(db, {
					now: new Date(at(0).getTime() + ANALYTICS_ABANDONMENT_MS - 1),
					batchSize: 2,
				}),
			).toEqual({ scanned: 0, abandoned: 0, hasMore: false });

			const exactBoundary = new Date(at(0).getTime() + ANALYTICS_ABANDONMENT_MS);
			const first = await sweepAbandonedFunnels(db, { now: exactBoundary, batchSize: 2 });
			const second = await sweepAbandonedFunnels(db, { now: exactBoundary, batchSize: 2 });
			const third = await sweepAbandonedFunnels(db, { now: exactBoundary, batchSize: 2 });
			const retry = await sweepAbandonedFunnels(db, { now: exactBoundary, batchSize: 2 });
			expect(first).toEqual({ scanned: 2, abandoned: 2, hasMore: true });
			expect(second).toEqual({ scanned: 2, abandoned: 2, hasMore: true });
			expect(third).toEqual({ scanned: 1, abandoned: 1, hasMore: false });
			expect(retry).toEqual({ scanned: 0, abandoned: 0, hasMore: false });
			expect(ANALYTICS_SWEEP_BATCH_SIZE).toBe(100);

			for (const [index, funnelId] of funnelIds.entries()) {
				const events = await listAnalyticsEvents(db, funnelId);
				expect(events.filter((item) => item.eventName === "funnel_abandoned")).toHaveLength(1);
				expect(events.at(-1)).toMatchObject({
					eventName: "funnel_abandoned",
					lastCompletedStep: steps[index] ?? "funnel_started",
				});
			}
			expect(
				(await listAnalyticsEvents(db, FUNNEL_A)).some(
					(item) => item.eventName === "funnel_abandoned",
				),
			).toBe(false);
		} finally {
			await client.close();
		}
	});

	it("resumes before 30 minutes and replaces an objectively abandoned funnel afterward", async () => {
		const { client, db } = await createTestDatabase();
		try {
			await startAnalyticsFunnel(db, { now: at(0), idFactory: () => FUNNEL_A });
			await recordAnalyticsEvent(db, {
				requestedFunnelId: FUNNEL_A,
				eventName: "flight_recognized",
				now: new Date(at(0).getTime() + ANALYTICS_ABANDONMENT_MS - 1),
			});
			expect(
				(
					await sweepAbandonedFunnels(db, {
						now: new Date(at(0).getTime() + ANALYTICS_ABANDONMENT_MS),
					})
				).abandoned,
			).toBe(0);

			const afterSecondBoundary = new Date(at(0).getTime() + 2 * ANALYTICS_ABANDONMENT_MS);
			const resumed = await recordAnalyticsEvent(
				db,
				{
					requestedFunnelId: FUNNEL_A,
					eventName: "recommendations_viewed",
					now: afterSecondBoundary,
				},
				{ idFactory: () => FUNNEL_B },
			);
			expect(resumed).toMatchObject({
				funnelId: FUNNEL_B,
				replacedFunnelId: FUNNEL_A,
				eventCreated: true,
			});
			expect((await getFunnelState(db, FUNNEL_A))?.status).toBe("abandoned");
			expect((await listAnalyticsEvents(db, FUNNEL_A)).at(-1)?.eventName).toBe("funnel_abandoned");
			expect((await listAnalyticsEvents(db, FUNNEL_B)).map((item) => item.eventName)).toEqual([
				"funnel_started",
				"recommendations_viewed",
			]);
		} finally {
			await client.close();
		}
	});

	it("aggregates the product funnel without private-table joins", async () => {
		const { client, db } = await createTestDatabase();
		try {
			for (const [funnelId, actor, bucket] of [
				[FUNNEL_A, ACTOR_A, "two_to_five"],
				[FUNNEL_B, ACTOR_A, "one"],
			] as const) {
				await seedCompletedFunnel(db, funnelId, actor, bucket);
			}
			const report = await getAnalyticsReport(db);
			expect(report.eventCounts).toMatchObject({
				funnel_started: 2,
				flight_recognized: 2,
				recommendations_viewed: 2,
				transport_selected: 2,
				room_joined: 2,
				chat_activated: 2,
				funnel_abandoned: 0,
			});
			expect(report.rates).toEqual({
				recognition: 1,
				recommendations: 1,
				selection: 1,
				roomEntry: 1,
				chatActivation: 1,
				abandonment: 0,
			});
			expect(report.socialRoomCount).toBe(1);
			expect(report.repeatFlightActorCount).toBe(1);
		} finally {
			await client.close();
		}
	});
});
