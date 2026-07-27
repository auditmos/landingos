import { ANALYTICS_SWEEP_BATCH_SIZE, sweepAbandonedFunnels } from "@repo/data-ops/analytics";
import { getDb } from "@repo/data-ops/database/setup";
import { LIFECYCLE_CLEANUP_BATCH_SIZE, purgeExpiredRoomContent } from "@repo/data-ops/lifecycle";

interface ScheduledOperations {
	sweepAbandonedFunnels(input: {
		now: Date;
		batchSize: number;
	}): Promise<{ scanned: number; abandoned: number; hasMore: boolean }>;
	purgeExpiredRoomContent(input: { now: Date; batchSize: number }): Promise<{
		roomsScanned: number;
		messagesPurged: number;
		snapshotsPurged: number;
		hasMore: boolean;
	}>;
}

export type ScheduledOperationsFactory = (env: Env) => ScheduledOperations;

const defaultOperations: ScheduledOperationsFactory = () => {
	const db = getDb();
	return {
		sweepAbandonedFunnels: (input) => sweepAbandonedFunnels(db, input),
		purgeExpiredRoomContent: (input) => purgeExpiredRoomContent(db, input),
	};
};

export function createScheduledHandler(
	operationsFactory: ScheduledOperationsFactory = defaultOperations,
) {
	return async (
		controller: ScheduledController,
		env: Env,
		_ctx: ExecutionContext,
	): Promise<void> => {
		const operations = operationsFactory(env);
		const now = new Date(controller.scheduledTime);
		await operations.sweepAbandonedFunnels({
			now,
			batchSize: ANALYTICS_SWEEP_BATCH_SIZE,
		});
		await operations.purgeExpiredRoomContent({
			now,
			batchSize: LIFECYCLE_CLEANUP_BATCH_SIZE,
		});
	};
}

export const handleScheduled = createScheduledHandler();
