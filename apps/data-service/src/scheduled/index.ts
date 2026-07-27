import { ANALYTICS_SWEEP_BATCH_SIZE, sweepAbandonedFunnels } from "@repo/data-ops/analytics";
import { getDb } from "@repo/data-ops/database/setup";

interface ScheduledOperations {
	sweepAbandonedFunnels(input: {
		now: Date;
		batchSize: number;
	}): Promise<{ scanned: number; abandoned: number; hasMore: boolean }>;
}

export type ScheduledOperationsFactory = (env: Env) => ScheduledOperations;

const defaultOperations: ScheduledOperationsFactory = () => {
	const db = getDb();
	return {
		sweepAbandonedFunnels: (input) => sweepAbandonedFunnels(db, input),
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
		await operationsFactory(env).sweepAbandonedFunnels({
			now: new Date(controller.scheduledTime),
			batchSize: ANALYTICS_SWEEP_BATCH_SIZE,
		});
	};
}

export const handleScheduled = createScheduledHandler();
