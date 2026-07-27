import { z } from "zod";

export const ACCOUNT_DELETE_CONFIRMATION = "USUŃ KONTO";

const AccountDeletionRequestSchema = z.strictObject({
	confirmation: z.literal(ACCOUNT_DELETE_CONFIRMATION),
});

export interface AccountDeletionApiDependencies {
	deleteAuthenticatedUser(request: Request): Promise<Response>;
}

function json(body: unknown, status: number) {
	return Response.json(body, { status });
}

async function responseCode(response: Response): Promise<string | null> {
	const body = (await response
		.clone()
		.json()
		.catch(() => null)) as { code?: unknown } | null;
	return typeof body?.code === "string" ? body.code : null;
}

export function createAccountDeletionApiHandler(dependencies: AccountDeletionApiDependencies) {
	return async (request: Request): Promise<Response> => {
		const parsed = AccountDeletionRequestSchema.safeParse(
			await request.json().catch(() => undefined),
		);
		if (!parsed.success) {
			return json(
				{
					code: "account_delete_confirmation_invalid",
					message: `Wpisz „${ACCOUNT_DELETE_CONFIRMATION}”, aby potwierdzić usunięcie konta.`,
				},
				400,
			);
		}

		const deletion = await dependencies.deleteAuthenticatedUser(request);
		if (deletion.ok) {
			const headers = new Headers(deletion.headers);
			headers.delete("content-length");
			headers.delete("content-type");
			return new Response(null, { status: 204, headers });
		}

		const code = await responseCode(deletion);
		if (deletion.status === 401 || deletion.status === 403 || code === "UNAUTHORIZED") {
			return json(
				{
					code: "account_delete_unauthorized",
					message: "Zaloguj się ponownie, aby usunąć konto.",
				},
				401,
			);
		}
		if (
			code === "SESSION_EXPIRED" ||
			code === "SESSION_NOT_FRESH" ||
			code === "FRESH_SESSION_REQUIRED"
		) {
			return json(
				{
					code: "account_reauthentication_required",
					message: "Zaloguj się ponownie kodem e-mail, a następnie ponów usunięcie konta.",
				},
				409,
			);
		}
		return json(
			{
				code: "account_delete_failed",
				message: "Nie udało się usunąć konta. Spróbuj ponownie.",
			},
			500,
		);
	};
}
