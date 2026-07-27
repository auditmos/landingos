import {
	MarketingConsentUpdateRequestSchema,
	normalizePseudonym,
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
