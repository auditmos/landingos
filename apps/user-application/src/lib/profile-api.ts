import {
	type IdentityProfile,
	type MarketingConsentUpdateRequest,
	type ProfilePatchRequest,
	ProfilePatchRequestSchema,
	PublicProfileSchema,
} from "@repo/data-ops/identity";

interface ProfileSession {
	user: {
		id: string;
	};
}

export interface ProfileApiDependencies {
	getSession: (request: Request) => Promise<ProfileSession | null>;
	updatePseudonym: (userId: string, pseudonym: string) => Promise<IdentityProfile | null>;
	updateMarketingConsent: (
		userId: string,
		input: MarketingConsentUpdateRequest,
		updatedAt: Date,
	) => Promise<IdentityProfile | null>;
	now: () => Date;
}

function json(body: unknown, status = 200) {
	return Response.json(body, { status });
}

async function readPatchRequest(
	request: Request,
): Promise<{ data: ProfilePatchRequest } | { response: Response }> {
	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return {
			response: json({ code: "INVALID_REQUEST", message: "Nieprawidłowe dane żądania." }, 400),
		};
	}
	const parsed = ProfilePatchRequestSchema.safeParse(rawBody);
	if (!parsed.success) {
		return {
			response: json(
				{
					code: "INVALID_PROFILE",
					message: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane profilu.",
				},
				400,
			),
		};
	}
	return { data: parsed.data };
}

export function createProfileApiHandler(dependencies: ProfileApiDependencies) {
	return async (request: Request): Promise<Response> => {
		const session = await dependencies.getSession(request);
		if (!session) {
			return json(
				{
					code: "UNAUTHORIZED",
					message: "Zaloguj się, aby zmienić profil.",
				},
				401,
			);
		}

		const patch = await readPatchRequest(request);
		if ("response" in patch) {
			return patch.response;
		}

		try {
			if (patch.data.action === "pseudonym") {
				const profile = await dependencies.updatePseudonym(session.user.id, patch.data.pseudonym);
				if (!profile?.pseudonym) {
					return json({ code: "PROFILE_NOT_FOUND", message: "Nie znaleziono profilu." }, 404);
				}
				return json(PublicProfileSchema.parse(profile));
			}

			const profile = await dependencies.updateMarketingConsent(
				session.user.id,
				{
					granted: patch.data.granted,
					policyVersion: patch.data.policyVersion,
				},
				dependencies.now(),
			);
			if (!profile?.marketingConsentUpdatedAt) {
				return json({ code: "PROFILE_NOT_FOUND", message: "Nie znaleziono profilu." }, 404);
			}
			return json({
				granted: profile.marketingConsentGranted,
				policyVersion: profile.marketingConsentPolicyVersion,
				updatedAt: profile.marketingConsentUpdatedAt.toISOString(),
			});
		} catch {
			return json(
				{ code: "PROFILE_UPDATE_FAILED", message: "Nie udało się zaktualizować profilu." },
				500,
			);
		}
	};
}
