import {
	ACCOUNT_DELETE_CONFIRMATION,
	type AccountDeletionApiDependencies,
	createAccountDeletionApiHandler,
} from "./account-deletion-api";

function request(body: unknown, headers: HeadersInit = {}) {
	return new Request("http://localhost/api/account", {
		method: "DELETE",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

function dependencies(
	response: Response,
	overrides: Partial<AccountDeletionApiDependencies> = {},
): AccountDeletionApiDependencies {
	return {
		deleteAuthenticatedUser: vi.fn(async () => response),
		...overrides,
	};
}

describe("account deletion API boundary", () => {
	it("accepts only the current account confirmation and preserves the revoked session cookie", async () => {
		const deps = dependencies(
			Response.json(
				{ success: true, message: "User deleted" },
				{
					headers: {
						"set-cookie": "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
					},
				},
			),
		);
		const response = await createAccountDeletionApiHandler(deps)(
			request({ confirmation: ACCOUNT_DELETE_CONFIRMATION }),
		);
		expect(response.status).toBe(204);
		expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
		expect(deps.deleteAuthenticatedUser).toHaveBeenCalledOnce();
	});

	it("fails unauthenticated, repeated, and shared service-token attempts without an account target", async () => {
		const attempts: HeadersInit[] = [
			{},
			{ Authorization: "Bearer shared-data-service-token-canary-94d2" },
			{ cookie: "better-auth.session_token=already-deleted" },
		];
		for (const headers of attempts) {
			const deps = dependencies(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }));
			const response = await createAccountDeletionApiHandler(deps)(
				request({ confirmation: ACCOUNT_DELETE_CONFIRMATION }, headers),
			);
			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({
				code: "account_delete_unauthorized",
				message: "Zaloguj się ponownie, aby usunąć konto.",
			});
		}
	});

	it("maps Better Auth's stale-session response to a Polish re-authentication state", async () => {
		const deps = dependencies(
			Response.json({ code: "SESSION_EXPIRED", message: "Session expired" }, { status: 400 }),
		);
		const response = await createAccountDeletionApiHandler(deps)(
			request({ confirmation: ACCOUNT_DELETE_CONFIRMATION }),
		);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			code: "account_reauthentication_required",
			message: "Zaloguj się ponownie kodem e-mail, a następnie ponów usunięcie konta.",
		});
	});

	it("rejects wrong confirmation and cross-user fields before calling Better Auth", async () => {
		for (const body of [
			{ confirmation: "usuń" },
			{ confirmation: ACCOUNT_DELETE_CONFIRMATION, userId: "other-user" },
			{ confirmation: ACCOUNT_DELETE_CONFIRMATION, email: "other@example.test" },
		]) {
			const deps = dependencies(Response.json({ success: true }));
			const response = await createAccountDeletionApiHandler(deps)(request(body));
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				code: "account_delete_confirmation_invalid",
				message: `Wpisz „${ACCOUNT_DELETE_CONFIRMATION}”, aby potwierdzić usunięcie konta.`,
			});
			expect(deps.deleteAuthenticatedUser).not.toHaveBeenCalled();
		}
	});
});
