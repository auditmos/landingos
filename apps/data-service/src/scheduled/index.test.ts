import {
	createExecutionContext,
	createScheduledController,
	waitOnExecutionContext,
} from "cloudflare:test";
import { ANALYTICS_SWEEP_BATCH_SIZE } from "@repo/data-ops/analytics";
import { LIFECYCLE_CLEANUP_BATCH_SIZE } from "@repo/data-ops/lifecycle";
import { createScheduledHandler } from "./index";

describe("bounded analytics abandonment schedule", () => {
	it("uses the scheduled controller clock and remains retry-safe without sleeping", async () => {
		const sweepAbandonedFunnels = vi
			.fn()
			.mockResolvedValueOnce({ scanned: 2, abandoned: 2, hasMore: true })
			.mockResolvedValueOnce({ scanned: 0, abandoned: 0, hasMore: false });
		const purgeExpiredRoomContent = vi
			.fn()
			.mockResolvedValueOnce({
				roomsScanned: 2,
				messagesPurged: 2,
				snapshotsPurged: 1,
				hasMore: true,
			})
			.mockResolvedValueOnce({
				roomsScanned: 0,
				messagesPurged: 0,
				snapshotsPurged: 0,
				hasMore: false,
			});
		const handler = createScheduledHandler(() => ({
			sweepAbandonedFunnels,
			purgeExpiredRoomContent,
		}));
		const scheduledTime = new Date("2026-09-14T07:30:00.000Z");

		for (let attempt = 0; attempt < 2; attempt += 1) {
			const controller = createScheduledController({
				cron: "*/5 * * * *",
				scheduledTime,
			});
			const context = createExecutionContext();
			await handler(controller, {} as Env, context);
			await waitOnExecutionContext(context);
		}

		expect(sweepAbandonedFunnels).toHaveBeenCalledTimes(2);
		expect(sweepAbandonedFunnels).toHaveBeenNthCalledWith(1, {
			now: scheduledTime,
			batchSize: ANALYTICS_SWEEP_BATCH_SIZE,
		});
		expect(sweepAbandonedFunnels).toHaveBeenNthCalledWith(2, {
			now: scheduledTime,
			batchSize: ANALYTICS_SWEEP_BATCH_SIZE,
		});
		expect(purgeExpiredRoomContent).toHaveBeenCalledTimes(2);
		expect(purgeExpiredRoomContent).toHaveBeenNthCalledWith(1, {
			now: scheduledTime,
			batchSize: LIFECYCLE_CLEANUP_BATCH_SIZE,
		});
		expect(purgeExpiredRoomContent).toHaveBeenNthCalledWith(2, {
			now: scheduledTime,
			batchSize: LIFECYCLE_CLEANUP_BATCH_SIZE,
		});
	});
});
