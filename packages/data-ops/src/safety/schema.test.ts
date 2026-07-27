import { describe, expect, it } from "vitest";
import {
	COMMUNITY_RULES_TOPICS,
	COMMUNITY_RULES_VERSION,
	CommunityRulesAcceptanceRequestSchema,
	SafetyReportCreateRequestSchema,
	SafetyReportEvidenceSchema,
} from "./schema";

describe("community rules contract", () => {
	it("locks the current version and the four approved Polish topics", () => {
		expect(COMMUNITY_RULES_VERSION).toBe("2026-07-26-v1");
		expect(COMMUNITY_RULES_TOPICS).toEqual([
			"Szanuj innych. Nie nękaj, nie groź, nie dyskryminuj i nie podszywaj się pod inne osoby.",
			"Nie wywieraj presji dotyczącej pieniędzy ani prywatnych informacji. Nie udostępniaj danych osobowych innych osób.",
			"LandingOS nie weryfikuje tożsamości ani nie gwarantuje wspólnego przejazdu. Kieruj się rozsądkiem — blokuj i zgłaszaj problemy.",
			"Nie publikuj nielegalnych treści ani komercyjnego spamu.",
		]);
		expect(
			CommunityRulesAcceptanceRequestSchema.parse({ version: COMMUNITY_RULES_VERSION }),
		).toEqual({ version: COMMUNITY_RULES_VERSION });
	});
});

describe("safety report contracts", () => {
	it("accepts exactly 500 Unicode code points and rejects 501", () => {
		const base = {
			targetType: "member",
			targetPseudonym: "Bartek BGY",
			reason: "harassment_or_discrimination",
		} as const;
		expect(
			SafetyReportCreateRequestSchema.safeParse({ ...base, note: "🙂".repeat(500) }).success,
		).toBe(true);
		const rejected = SafetyReportCreateRequestSchema.safeParse({
			...base,
			note: "🙂".repeat(501),
		});
		expect(rejected.success).toBe(false);
		if (!rejected.success) {
			expect(rejected.error.issues[0]?.message).toMatch(/500 znaków/);
		}
	});

	it("keeps message evidence to the exact immutable allowlist", () => {
		const evidence = SafetyReportEvidenceSchema.parse({
			messageText: "Niewłaściwa wiadomość",
			authorPseudonym: "Bartek BGY",
			originalMessageAt: "2026-09-14T07:00:00.000Z",
		});
		expect(Object.keys(evidence)).toEqual(["messageText", "authorPseudonym", "originalMessageAt"]);
		expect(JSON.stringify(evidence)).not.toMatch(
			/email|destination|placeId|coordinates|consent|role|provider|unrelated/i,
		);
	});

	it("rejects private evidence and ambiguous report targets", () => {
		expect(
			SafetyReportEvidenceSchema.safeParse({
				messageText: "Treść",
				authorPseudonym: "Bartek BGY",
				originalMessageAt: "2026-09-14T07:00:00.000Z",
				email: "private@example.com",
			}).success,
		).toBe(false);
		expect(
			SafetyReportCreateRequestSchema.safeParse({
				targetType: "message",
				messageId: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
				targetPseudonym: "Bartek BGY",
				reason: "other",
			}).success,
		).toBe(false);
	});
});
