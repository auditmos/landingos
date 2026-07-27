import {
	type AccountDeletionHookDependencies,
	prepareAndBroadcastAccountDeletion,
} from "./account-deletion-hook";

describe("account deletion hook coordination", () => {
	it("prepares private data first and broadcasts only room coordinates", async () => {
		const order: string[] = [];
		const dependencies: AccountDeletionHookDependencies = {
			now: () => new Date("2026-09-14T07:30:00.000Z"),
			prepare: vi.fn(async () => {
				order.push("prepare");
				return {
					rooms: [
						{
							roomId: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
							coordinatorKey: "flight-1",
						},
					],
				};
			}),
			broadcast: vi.fn(async () => {
				order.push("broadcast");
				return new Response(null, { status: 200 });
			}),
		};
		await prepareAndBroadcastAccountDeletion(
			dependencies,
			"user-canary-94d2",
			"delete-canary-94d2@example.test",
		);
		expect(order).toEqual(["prepare", "broadcast"]);
		expect(dependencies.prepare).toHaveBeenCalledWith({
			userId: "user-canary-94d2",
			email: "delete-canary-94d2@example.test",
			now: new Date("2026-09-14T07:30:00.000Z"),
		});
		expect(dependencies.broadcast).toHaveBeenCalledWith([
			{
				roomId: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
				coordinatorKey: "flight-1",
			},
		]);
		expect(JSON.stringify(vi.mocked(dependencies.broadcast).mock.calls)).not.toMatch(
			/delete-canary|address-canary|place-canary|coordinates-canary|message-canary/i,
		);
	});

	it("fails closed when active clients cannot be redacted", async () => {
		const dependencies: AccountDeletionHookDependencies = {
			now: () => new Date("2026-09-14T07:30:00.000Z"),
			prepare: vi.fn(async () => ({
				rooms: [
					{
						roomId: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
						coordinatorKey: "flight-1",
					},
				],
			})),
			broadcast: vi.fn(async () => new Response(null, { status: 503 })),
		};
		await expect(
			prepareAndBroadcastAccountDeletion(dependencies, "user-a", "a@example.test"),
		).rejects.toThrow("Nie udało się zanonimizować aktywnych pokojów.");
	});
});
