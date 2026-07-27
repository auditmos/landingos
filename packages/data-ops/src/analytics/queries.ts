import { and, asc, eq, lte } from "drizzle-orm";
import type { getDb } from "@/database/setup";
import {
	ANALYTICS_EVENT_NAMES,
	ANALYTICS_FUNNEL_STEPS,
	ANALYTICS_SCHEMA_VERSION,
	type AnalyticsEvent,
	AnalyticsEventSchema,
	type AnalyticsFunnelReport,
	AnalyticsFunnelReportSchema,
	type AnalyticsFunnelState,
	AnalyticsFunnelStateSchema,
	type AnalyticsFunnelStep,
	FunnelIdSchema,
	type RoomOccupancyBucket,
	type TransportKind,
} from "./schema";
import { analyticsEvents, analyticsFunnels } from "./table";

export const ANALYTICS_ABANDONMENT_MS = 30 * 60 * 1_000;
export const ANALYTICS_SWEEP_BATCH_SIZE = 100;

export type AnalyticsDatabase = Pick<ReturnType<typeof getDb>, "insert" | "select" | "update">;

type RandomFill = (bytes: Uint8Array) => Uint8Array;
type TrackableEvent = Exclude<AnalyticsEvent["eventName"], "funnel_started" | "funnel_abandoned">;

const STEP_RANK = new Map(ANALYTICS_FUNNEL_STEPS.map((step, index) => [step, index]));

export function createFunnelId(
	fill: RandomFill = (bytes) => crypto.getRandomValues(bytes),
): string {
	return [...fill(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function eventRow(input: {
	eventName: AnalyticsEvent["eventName"];
	eventTime: Date;
	funnelId: string;
	actorPseudonym?: string | null;
	lastCompletedStep: AnalyticsFunnelStep;
	transportKind?: TransportKind | null;
	roomOccupancyBucket?: RoomOccupancyBucket | null;
}) {
	const event = AnalyticsEventSchema.parse({
		...input,
		eventTime: input.eventTime.toISOString(),
		actorPseudonym: input.actorPseudonym ?? null,
		transportKind: input.transportKind ?? null,
		roomOccupancyBucket: input.roomOccupancyBucket ?? null,
		schemaVersion: ANALYTICS_SCHEMA_VERSION,
	});
	return {
		...event,
		eventTime: new Date(event.eventTime),
	};
}

async function insertEvent(
	db: AnalyticsDatabase,
	input: Parameters<typeof eventRow>[0],
): Promise<boolean> {
	const [inserted] = await db
		.insert(analyticsEvents)
		.values(eventRow(input))
		.onConflictDoNothing({
			target: [analyticsEvents.funnelId, analyticsEvents.eventName],
		})
		.returning({ funnelId: analyticsEvents.funnelId });
	return Boolean(inserted);
}

export async function startAnalyticsFunnel(
	db: AnalyticsDatabase,
	options: { now?: Date; idFactory?: () => string } = {},
) {
	const now = options.now ?? new Date();
	const funnelId = FunnelIdSchema.parse((options.idFactory ?? createFunnelId)());
	const [inserted] = await db
		.insert(analyticsFunnels)
		.values({
			id: funnelId,
			status: "active",
			lastCompletedStep: "funnel_started",
			createdAt: now,
			lastActivityAt: now,
		})
		.onConflictDoNothing({ target: analyticsFunnels.id })
		.returning({ id: analyticsFunnels.id });
	await insertEvent(db, {
		eventName: "funnel_started",
		eventTime: now,
		funnelId,
		lastCompletedStep: "funnel_started",
	});
	return { funnelId, created: Boolean(inserted) };
}

async function funnelRow(db: AnalyticsDatabase, funnelId: string) {
	const [row] = await db
		.select()
		.from(analyticsFunnels)
		.where(eq(analyticsFunnels.id, funnelId))
		.limit(1);
	return row;
}

async function abandonFunnel(
	db: AnalyticsDatabase,
	funnel: NonNullable<Awaited<ReturnType<typeof funnelRow>>>,
) {
	if (funnel.status !== "active" || funnel.lastCompletedStep === "chat_activated") return false;
	const boundary = new Date(funnel.lastActivityAt.getTime() + ANALYTICS_ABANDONMENT_MS);
	const created = await insertEvent(db, {
		eventName: "funnel_abandoned",
		eventTime: boundary,
		funnelId: funnel.id,
		lastCompletedStep: funnel.lastCompletedStep,
	});
	await db
		.update(analyticsFunnels)
		.set({ status: "abandoned" })
		.where(and(eq(analyticsFunnels.id, funnel.id), eq(analyticsFunnels.status, "active")));
	return created;
}

export async function ensureActiveAnalyticsFunnel(
	db: AnalyticsDatabase,
	input: {
		requestedFunnelId?: string | null;
		now?: Date;
	},
	options: { idFactory?: () => string } = {},
) {
	const now = input.now ?? new Date();
	const requested = FunnelIdSchema.safeParse(input.requestedFunnelId);
	const funnel = requested.success ? await funnelRow(db, requested.data) : undefined;
	if (
		funnel?.status === "active" &&
		now.getTime() - funnel.lastActivityAt.getTime() < ANALYTICS_ABANDONMENT_MS
	) {
		await db
			.update(analyticsFunnels)
			.set({ lastActivityAt: now })
			.where(and(eq(analyticsFunnels.id, funnel.id), eq(analyticsFunnels.status, "active")));
		return { funnelId: funnel.id, created: false, replacedFunnelId: undefined };
	}
	if (funnel?.status === "active") await abandonFunnel(db, funnel);
	const started = await startAnalyticsFunnel(db, { now, idFactory: options.idFactory });
	return {
		...started,
		replacedFunnelId: funnel?.id,
	};
}

export async function recordAnalyticsEvent(
	db: AnalyticsDatabase,
	input: {
		requestedFunnelId?: string | null;
		eventName: TrackableEvent;
		actorPseudonym?: string;
		transportKind?: TransportKind;
		roomOccupancyBucket?: RoomOccupancyBucket;
		now?: Date;
	},
	options: { idFactory?: () => string } = {},
) {
	const now = input.now ?? new Date();
	const requested = FunnelIdSchema.safeParse(input.requestedFunnelId);
	let funnel = requested.success ? await funnelRow(db, requested.data) : undefined;
	let replacedFunnelId: string | undefined;
	if (
		funnel?.status === "active" &&
		now.getTime() - funnel.lastActivityAt.getTime() >= ANALYTICS_ABANDONMENT_MS
	) {
		await abandonFunnel(db, funnel);
		replacedFunnelId = funnel.id;
		funnel = undefined;
	} else if (funnel?.status === "abandoned") {
		replacedFunnelId = funnel.id;
		funnel = undefined;
	}
	if (!funnel) {
		const started = await startAnalyticsFunnel(db, {
			now,
			idFactory: options.idFactory,
		});
		funnel = await funnelRow(db, started.funnelId);
	}
	if (!funnel) throw new Error("Nie udało się utworzyć lejka analitycznego.");
	if (funnel.status === "completed") {
		return { funnelId: funnel.id, eventCreated: false, replacedFunnelId };
	}
	const eventCreated = await insertEvent(db, {
		eventName: input.eventName,
		eventTime: now,
		funnelId: funnel.id,
		actorPseudonym: input.actorPseudonym,
		lastCompletedStep: input.eventName,
		transportKind: input.transportKind,
		roomOccupancyBucket: input.roomOccupancyBucket,
	});
	const currentRank = STEP_RANK.get(funnel.lastCompletedStep) ?? 0;
	const eventRank = STEP_RANK.get(input.eventName) ?? currentRank;
	await db
		.update(analyticsFunnels)
		.set({
			lastActivityAt: now,
			lastCompletedStep: eventRank > currentRank ? input.eventName : funnel.lastCompletedStep,
			status: input.eventName === "chat_activated" ? "completed" : "active",
		})
		.where(and(eq(analyticsFunnels.id, funnel.id), eq(analyticsFunnels.status, "active")));
	return { funnelId: funnel.id, eventCreated, replacedFunnelId };
}

export async function getFunnelState(
	db: AnalyticsDatabase,
	funnelId: string,
): Promise<AnalyticsFunnelState | null> {
	const row = await funnelRow(db, FunnelIdSchema.parse(funnelId));
	if (!row) return null;
	return AnalyticsFunnelStateSchema.parse({
		funnelId: row.id,
		status: row.status,
		lastCompletedStep: row.lastCompletedStep,
		createdAt: row.createdAt.toISOString(),
		lastActivityAt: row.lastActivityAt.toISOString(),
	});
}

export async function listAnalyticsEvents(
	db: AnalyticsDatabase,
	funnelId?: string,
): Promise<AnalyticsEvent[]> {
	const rows = await db
		.select()
		.from(analyticsEvents)
		.where(funnelId ? eq(analyticsEvents.funnelId, FunnelIdSchema.parse(funnelId)) : undefined)
		.orderBy(asc(analyticsEvents.eventTime));
	return rows
		.map((row) =>
			AnalyticsEventSchema.parse({
				...row,
				eventTime: row.eventTime.toISOString(),
			}),
		)
		.sort((left, right) => {
			const byTime = Date.parse(left.eventTime) - Date.parse(right.eventTime);
			if (byTime !== 0) return byTime;
			return (
				ANALYTICS_EVENT_NAMES.indexOf(left.eventName) -
				ANALYTICS_EVENT_NAMES.indexOf(right.eventName)
			);
		});
}

export async function sweepAbandonedFunnels(
	db: AnalyticsDatabase,
	options: { now?: Date; batchSize?: number } = {},
) {
	const now = options.now ?? new Date();
	const batchSize = Math.max(
		1,
		Math.min(options.batchSize ?? ANALYTICS_SWEEP_BATCH_SIZE, ANALYTICS_SWEEP_BATCH_SIZE),
	);
	const cutoff = new Date(now.getTime() - ANALYTICS_ABANDONMENT_MS);
	const candidates = await db
		.select()
		.from(analyticsFunnels)
		.where(and(eq(analyticsFunnels.status, "active"), lte(analyticsFunnels.lastActivityAt, cutoff)))
		.orderBy(asc(analyticsFunnels.lastActivityAt))
		.limit(batchSize + 1);
	let abandoned = 0;
	for (const candidate of candidates.slice(0, batchSize)) {
		if (await abandonFunnel(db, candidate)) abandoned += 1;
	}
	return {
		scanned: Math.min(candidates.length, batchSize),
		abandoned,
		hasMore: candidates.length > batchSize,
	};
}

function emptyCounts<T extends readonly string[]>(keys: T): Record<T[number], number> {
	return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T[number], number>;
}

export async function getAnalyticsReport(db: AnalyticsDatabase): Promise<AnalyticsFunnelReport> {
	const events = await listAnalyticsEvents(db);
	const eventCounts = emptyCounts(ANALYTICS_EVENT_NAMES);
	const abandonmentByStep = emptyCounts(ANALYTICS_FUNNEL_STEPS);
	const actorFlights = new Map<string, Set<string>>();
	let socialRoomCount = 0;
	for (const event of events) {
		eventCounts[event.eventName] += 1;
		if (event.eventName === "funnel_abandoned") {
			abandonmentByStep[event.lastCompletedStep] += 1;
		}
		if (event.eventName === "room_joined") {
			if (event.roomOccupancyBucket !== "one") socialRoomCount += 1;
			if (event.actorPseudonym) {
				const funnels = actorFlights.get(event.actorPseudonym) ?? new Set<string>();
				funnels.add(event.funnelId);
				actorFlights.set(event.actorPseudonym, funnels);
			}
		}
	}
	const total = eventCounts.funnel_started;
	const rate = (count: number) => (total === 0 ? 0 : count / total);
	return AnalyticsFunnelReportSchema.parse({
		totalFunnels: total,
		eventCounts,
		rates: {
			recognition: rate(eventCounts.flight_recognized),
			recommendations: rate(eventCounts.recommendations_viewed),
			selection: rate(eventCounts.transport_selected),
			roomEntry: rate(eventCounts.room_joined),
			chatActivation: rate(eventCounts.chat_activated),
			abandonment: rate(eventCounts.funnel_abandoned),
		},
		abandonmentByStep,
		socialRoomCount,
		repeatFlightActorCount: [...actorFlights.values()].filter((funnels) => funnels.size > 1).length,
	});
}
