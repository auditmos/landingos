import { getAuth } from "@repo/data-ops/auth/server";
import { createFileRoute } from "@tanstack/react-router";
import { createAccountDeletionApiHandler } from "@/lib/account-deletion-api";

const handleAccountDeletion = createAccountDeletionApiHandler({
	deleteAuthenticatedUser: (request) => {
		const url = new URL("/api/auth/delete-user", request.url);
		return getAuth().handler(
			new Request(url, {
				method: "POST",
				headers: request.headers,
				body: "{}",
			}),
		);
	},
});

export const Route = createFileRoute("/api/account")({
	server: {
		handlers: {
			DELETE: ({ request }) => handleAccountDeletion(request),
		},
	},
});
