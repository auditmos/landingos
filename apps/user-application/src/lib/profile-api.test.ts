import type { IdentityProfile } from "@repo/data-ops/identity";
import { createProfileApiHandler, type ProfileApiDependencies } from "./profile-api";

const baseProfile: IdentityProfile = {
	id: "user-1",
	emailVerified: true,
	pseudonym: null,
	marketingConsentGranted: false,
	marketingConsentPolicyVersion: null,
	marketingConsentUpdatedAt: null,
	role: "user",
};

function createDependencies(
	overrides: Partial<ProfileApiDependencies> = {},
): ProfileApiDependencies {
	return {
		getSession: async () => ({ user: { id: "user-1" } }),
		updatePseudonym: async (_userId, pseudonym) => ({ ...baseProfile, pseudonym }),
		updateMarketingConsent: async (_userId, input, updatedAt) => ({
			...baseProfile,
			marketingConsentGranted: input.granted,
			marketingConsentPolicyVersion: input.policyVersion ?? null,
			marketingConsentUpdatedAt: updatedAt,
		}),
		now: () => new Date("2026-07-27T10:00:00.000Z"),
		...overrides,
	};
}

function patch(body: unknown) {
	return new Request("http://localhost/api/profile", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("profile API", () => {
	it("requires a verified session", async () => {
		const handler = createProfileApiHandler(createDependencies({ getSession: async () => null }));
		const response = await handler(patch({ action: "pseudonym", pseudonym: "Janek" }));
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			code: "UNAUTHORIZED",
			message: "Zaloguj się, aby zmienić profil.",
		});
	});

	it("normalizes a pseudonym and returns only exact public keys", async () => {
		const updatePseudonym = vi.fn(async (_userId: string, pseudonym: string) => ({
			...baseProfile,
			pseudonym,
		}));
		const handler = createProfileApiHandler(createDependencies({ updatePseudonym }));
		const response = await handler(patch({ action: "pseudonym", pseudonym: "  Z\u0307aneta  " }));
		expect(response.status).toBe(200);
		expect(updatePseudonym).toHaveBeenCalledWith("user-1", "Żaneta");
		expect(await response.json()).toEqual({
			id: "user-1",
			pseudonym: "Żaneta",
		});
	});

	it("rejects self-assignment of operator without invoking persistence", async () => {
		const updatePseudonym = vi.fn();
		const updateMarketingConsent = vi.fn();
		const handler = createProfileApiHandler(
			createDependencies({ updatePseudonym, updateMarketingConsent }),
		);
		const response = await handler(
			patch({
				action: "pseudonym",
				pseudonym: "Janek",
				role: "operator",
			}),
		);
		expect(response.status).toBe(400);
		expect(updatePseudonym).not.toHaveBeenCalled();
		expect(updateMarketingConsent).not.toHaveBeenCalled();
	});

	it("records consent and withdrawal with policy metadata independently of login", async () => {
		const updateMarketingConsent = vi.fn(
			async (
				_userId: string,
				input: { granted: boolean; policyVersion?: string },
				updatedAt: Date,
			) => ({
				...baseProfile,
				marketingConsentGranted: input.granted,
				marketingConsentPolicyVersion: input.policyVersion ?? "2026-07",
				marketingConsentUpdatedAt: updatedAt,
			}),
		);
		const handler = createProfileApiHandler(createDependencies({ updateMarketingConsent }));
		const grantResponse = await handler(
			patch({
				action: "marketing_consent",
				granted: true,
				policyVersion: "2026-07",
			}),
		);
		expect(grantResponse.status).toBe(200);
		expect(await grantResponse.json()).toEqual({
			granted: true,
			policyVersion: "2026-07",
			updatedAt: "2026-07-27T10:00:00.000Z",
		});

		const withdrawResponse = await handler(
			patch({
				action: "marketing_consent",
				granted: false,
			}),
		);
		expect(withdrawResponse.status).toBe(200);
		expect(await withdrawResponse.json()).toEqual({
			granted: false,
			policyVersion: "2026-07",
			updatedAt: "2026-07-27T10:00:00.000Z",
		});
	});
});
