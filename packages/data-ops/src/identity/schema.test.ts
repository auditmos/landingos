import {
	MarketingConsentUpdateRequestSchema,
	normalizePseudonym,
	ProfilePatchRequestSchema,
	ProfileUpdateRequestSchema,
	PublicProfileSchema,
} from "./schema";

describe("normalizePseudonym", () => {
	it("normalizes to NFC and trims outer whitespace", () => {
		expect(normalizePseudonym("  Z\u0307aneta  ")).toBe("Żaneta");
	});

	it.each(["Jan", "Łukasz 7", "Żółw_2", "Marek-K"])("accepts %s", (pseudonym) => {
		expect(ProfileUpdateRequestSchema.safeParse({ pseudonym }).success).toBe(true);
	});

	it("accepts exactly 3 and 24 Unicode code points", () => {
		expect(ProfileUpdateRequestSchema.safeParse({ pseudonym: "Łuk" }).success).toBe(true);
		expect(ProfileUpdateRequestSchema.safeParse({ pseudonym: `A${"ą".repeat(22)}9` }).success).toBe(
			true,
		);
	});

	it.each([
		"Ab",
		`A${"ą".repeat(23)}9`,
		"_Jan",
		"Jan-",
		"Jan  Kowalski",
		"Jan.K",
		"Jan🙂K",
	])("rejects invalid pseudonym %s", (pseudonym) => {
		expect(ProfileUpdateRequestSchema.safeParse({ pseudonym }).success).toBe(false);
	});

	it("returns normalized data from the request schema", () => {
		expect(ProfileUpdateRequestSchema.parse({ pseudonym: "  Z\u0307aneta  " })).toEqual({
			pseudonym: "Żaneta",
		});
	});
});

describe("profile privacy boundaries", () => {
	it("returns exactly the public profile keys", () => {
		expect(
			PublicProfileSchema.parse({
				id: "user-1",
				pseudonym: "Żaneta",
				email: "private@example.com",
				marketingConsentGranted: true,
				marketingConsentPolicyVersion: "2026-07",
				marketingConsentUpdatedAt: new Date(),
				role: "operator",
				sessionToken: "secret",
				privateDestination: "Via Roma 1",
			}),
		).toEqual({
			id: "user-1",
			pseudonym: "Żaneta",
		});
	});

	it("does not accept role assignment through profile updates", () => {
		expect(
			ProfileUpdateRequestSchema.safeParse({
				pseudonym: "Janek",
				role: "operator",
			}).success,
		).toBe(false);
	});
});

describe("MarketingConsentUpdateRequestSchema", () => {
	it("requires a policy version when consent is granted", () => {
		expect(
			MarketingConsentUpdateRequestSchema.safeParse({
				granted: true,
				policyVersion: "2026-07",
			}).success,
		).toBe(true);
		expect(
			MarketingConsentUpdateRequestSchema.safeParse({
				granted: true,
			}).success,
		).toBe(false);
	});

	it("allows withdrawal without inventing a new policy version", () => {
		expect(MarketingConsentUpdateRequestSchema.parse({ granted: false })).toEqual({
			granted: false,
		});
	});
});

describe("ProfilePatchRequestSchema", () => {
	/*
	 * Characterization boundary: these pin the union's observable contract so the
	 * consent invariant can be defined exactly once (composed from the member
	 * schemas) without silently relaxing strictness, the Polish message, or the
	 * pseudonym preprocessing.
	 */
	it("carries the consent invariant into the marketing_consent member", () => {
		const rejected = ProfilePatchRequestSchema.safeParse({
			action: "marketing_consent",
			granted: true,
		});
		expect(rejected.success).toBe(false);
		expect(rejected.error?.issues[0]?.path).toEqual(["policyVersion"]);
		expect(rejected.error?.issues[0]?.message).toBe(
			"Wersja zgody jest wymagana przy jej udzieleniu.",
		);

		expect(
			ProfilePatchRequestSchema.safeParse({
				action: "marketing_consent",
				granted: true,
				policyVersion: "2026-07",
			}).success,
		).toBe(true);
	});

	it("allows withdrawal without a policy version", () => {
		expect(
			ProfilePatchRequestSchema.parse({ action: "marketing_consent", granted: false }),
		).toEqual({ action: "marketing_consent", granted: false });
	});

	it("stays strict — an unknown key is rejected on either member", () => {
		expect(
			ProfilePatchRequestSchema.safeParse({
				action: "marketing_consent",
				granted: false,
				role: "operator",
			}).success,
		).toBe(false);
		expect(
			ProfilePatchRequestSchema.safeParse({
				action: "pseudonym",
				pseudonym: "Janek",
				role: "operator",
			}).success,
		).toBe(false);
	});

	it("keeps pseudonym preprocessing on the pseudonym member", () => {
		expect(
			ProfilePatchRequestSchema.parse({ action: "pseudonym", pseudonym: "  Żaneta  " }),
		).toEqual({ action: "pseudonym", pseudonym: "Żaneta" });
		expect(
			ProfilePatchRequestSchema.safeParse({ action: "pseudonym", pseudonym: "Ab" }).success,
		).toBe(false);
	});

	it("rejects an unknown action", () => {
		expect(ProfilePatchRequestSchema.safeParse({ action: "role", role: "operator" }).success).toBe(
			false,
		);
	});
});
