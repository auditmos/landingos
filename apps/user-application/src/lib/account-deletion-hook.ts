import type { AccountDeletionRoom } from "@repo/data-ops/lifecycle";

export interface AccountDeletionHookDependencies {
	now(): Date;
	prepare(input: {
		userId: string;
		email: string;
		now: Date;
	}): Promise<{ rooms: AccountDeletionRoom[] }>;
	broadcast(rooms: AccountDeletionRoom[]): Promise<Response>;
}

export async function prepareAndBroadcastAccountDeletion(
	dependencies: AccountDeletionHookDependencies,
	userId: string,
	email: string,
): Promise<void> {
	const prepared = await dependencies.prepare({
		userId,
		email,
		now: dependencies.now(),
	});
	if (prepared.rooms.length === 0) return;
	const response = await dependencies.broadcast(prepared.rooms);
	if (!response.ok) {
		throw new Error("Nie udało się zanonimizować aktywnych pokojów.");
	}
}
