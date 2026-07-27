import type { JourneyVariant } from "@repo/data-ops/journey";
import {
	type PublicTransportSelection,
	type RoomSelection,
	RoomSelectionSchema,
} from "@repo/data-ops/room";
import { z } from "zod";

const ROOM_INTENT_KEY = "landingos.room-intent";

const RoomIntentSchema = z.strictObject({
	flightInstanceId: z.string().min(1),
	selection: RoomSelectionSchema,
});

export type RoomIntent = z.infer<typeof RoomIntentSchema>;

function browserStorage(): Storage | null {
	return typeof window === "undefined" ? null : window.sessionStorage;
}

function unique<T>(values: readonly T[]): T[] {
	return [...new Set(values)];
}

export function publicSelectionFromJourneyVariant(
	variant: JourneyVariant,
): PublicTransportSelection {
	return {
		kind: "public_transport",
		badges: [...variant.badges],
		modes: unique(variant.steps.map((step) => step.mode)),
		operatorNames: unique(
			variant.sourceReferences
				.map((source) => source.label.trim())
				.filter(Boolean)
				.map((name) => name.slice(0, 80)),
		).slice(0, 8),
	};
}

export function saveRoomIntent(intent: {
	flightInstanceId: string;
	selection: RoomSelection;
}): void {
	const storage = browserStorage();
	if (!storage) return;
	storage.setItem(ROOM_INTENT_KEY, JSON.stringify(RoomIntentSchema.parse(intent)));
}

export function loadRoomIntent(): RoomIntent | null {
	const storage = browserStorage();
	const raw = storage?.getItem(ROOM_INTENT_KEY);
	if (!raw) return null;
	try {
		const parsed = RoomIntentSchema.safeParse(JSON.parse(raw));
		if (parsed.success) return parsed.data;
	} catch {
		// Corrupt or stale browser state is discarded below.
	}
	storage?.removeItem(ROOM_INTENT_KEY);
	return null;
}

export function clearRoomIntent(): void {
	browserStorage()?.removeItem(ROOM_INTENT_KEY);
}
