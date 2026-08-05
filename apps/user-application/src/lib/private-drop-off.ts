import { z } from "zod";

const STORAGE_KEY = "landingos.private-drop-off";

/**
 * Browser-local memory of where the traveler is heading, so the flight room
 * can show it back to them and offer the opt-in drop-off share. Deliberately
 * stores only a display label — never place IDs or coordinates — and never
 * leaves sessionStorage unless the traveler explicitly shares it as
 * `dropOffText` in their room selection.
 */
const PrivateDropOffSchema = z.strictObject({
	flightInstanceId: z.string().min(1),
	label: z.string().trim().min(1).max(120),
});

export type PrivateDropOff = z.infer<typeof PrivateDropOffSchema>;

function browserStorage(): Storage | null {
	return typeof window === "undefined" ? null : window.sessionStorage;
}

export function savePrivateDropOff(dropOff: PrivateDropOff): void {
	const storage = browserStorage();
	if (!storage) return;
	const parsed = PrivateDropOffSchema.safeParse(dropOff);
	if (!parsed.success) return;
	storage.setItem(STORAGE_KEY, JSON.stringify(parsed.data));
}

export function loadPrivateDropOff(flightInstanceId: string): PrivateDropOff | null {
	const storage = browserStorage();
	const raw = storage?.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		const parsed = PrivateDropOffSchema.safeParse(JSON.parse(raw));
		if (parsed.success && parsed.data.flightInstanceId === flightInstanceId) {
			return parsed.data;
		}
	} catch {
		// Corrupt or stale browser state is discarded below.
	}
	storage?.removeItem(STORAGE_KEY);
	return null;
}

export function clearPrivateDropOff(): void {
	browserStorage()?.removeItem(STORAGE_KEY);
}
