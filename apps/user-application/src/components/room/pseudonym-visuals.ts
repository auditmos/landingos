// Deterministic, theme-neutral avatar colors so each pseudonym reads as a
// distinct person in the shared chat and member list. Shared by the chat
// bubbles (flight-room) and the "Osoby w pokoju" list (room-safety-panel).

const AVATAR_PALETTE = [
	"bg-rose-500",
	"bg-orange-500",
	"bg-amber-500",
	"bg-emerald-500",
	"bg-teal-500",
	"bg-sky-500",
	"bg-indigo-500",
	"bg-violet-500",
	"bg-fuchsia-500",
	"bg-pink-500",
] as const;

function hashPseudonym(pseudonym: string): number {
	let hash = 0;
	for (const char of pseudonym) {
		hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
	}
	return hash;
}

/** A stable accent background class (with white text) for a pseudonym. */
export function pseudonymColor(pseudonym: string): string {
	const index = hashPseudonym(pseudonym) % AVATAR_PALETTE.length;
	return AVATAR_PALETTE[index] ?? AVATAR_PALETTE[0];
}

/** Up to two uppercase initials derived from a pseudonym. */
export function pseudonymInitials(pseudonym: string): string {
	const parts = pseudonym.trim().split(/\s+/).filter(Boolean);
	const first = parts[0]?.[0] ?? "?";
	const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
	return (first + last).toUpperCase();
}
