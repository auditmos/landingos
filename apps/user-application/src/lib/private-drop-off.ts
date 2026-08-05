import { sanitizeJourneyExternalUrl } from "@repo/data-ops/journey";
import { z } from "zod";

const STORAGE_KEY = "landingos.private-drop-off";

const PrivateRouteStepSchema = z.strictObject({
	mode: z.string().trim().min(1).max(24),
	from: z.string().trim().min(1).max(80),
	to: z.string().trim().min(1).max(80),
	durationMinutes: z.number().int().min(0).max(600),
});

/**
 * Browser-local memory of where the traveler is heading and the route variant
 * they chose, so the flight room can show both back to them and offer the
 * opt-in drop-off share. Deliberately stores only display labels — never
 * place IDs or geographic identifiers — and never leaves sessionStorage
 * unless the traveler explicitly shares the label as `dropOffText` in their
 * room selection. The route summary is never shared at all.
 */
const PrivateDropOffSchema = z.strictObject({
	flightInstanceId: z.string().min(1),
	label: z.string().trim().min(1).max(120),
	route: z.array(PrivateRouteStepSchema).min(1).max(20).optional(),
});

export type PrivateDropOff = z.infer<typeof PrivateDropOffSchema>;
export type PrivateRouteStep = z.infer<typeof PrivateRouteStepSchema>;

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

/**
 * Google Maps place-search link for a drop-off label. Text query only —
 * there is nothing more precise to link, by design — and the result must
 * still pass the shared external-host allowlist.
 */
export function dropOffMapsUrl(label: string): string | null {
	const query = label.trim();
	if (!query) return null;
	return sanitizeJourneyExternalUrl(
		`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
	);
}
