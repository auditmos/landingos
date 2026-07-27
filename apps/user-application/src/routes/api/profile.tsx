import { getAuth } from "@repo/data-ops/auth/server";
import { getDb } from "@repo/data-ops/database/setup";
import { updateMarketingConsent, updatePseudonym } from "@repo/data-ops/identity";
import { createFileRoute } from "@tanstack/react-router";
import { createProfileApiHandler } from "@/lib/profile-api";

const handleProfileRequest = createProfileApiHandler({
	getSession: async (request) => {
		const session = await getAuth().api.getSession({ headers: request.headers });
		return session ? { user: { id: session.user.id } } : null;
	},
	updatePseudonym: (userId, pseudonym) => updatePseudonym(getDb(), userId, pseudonym),
	updateMarketingConsent: (userId, input, updatedAt) =>
		updateMarketingConsent(getDb(), userId, input, updatedAt),
	now: () => new Date(),
});

export const Route = createFileRoute("/api/profile")({
	server: {
		handlers: {
			PATCH: ({ request }) => handleProfileRequest(request),
		},
	},
});
