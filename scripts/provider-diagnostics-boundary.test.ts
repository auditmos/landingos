import { describe, expect, it } from "vitest";
import { ProviderDiagnosticSchema } from "../packages/data-ops/src/diagnostics/schema";
import { source } from "./leak-scan";

const validDiagnostic = {
	reference: "cf-ray-abc123",
	occurredAtUtc: "2026-08-13T09:15:30.000Z",
	recovery: "manual",
	providerClass: "lot",
	category: "plan_restricted",
} as const;

describe("provider diagnostic boundary", () => {
	it("accepts only the exact allowlisted diagnostic shape", () => {
		expect(ProviderDiagnosticSchema.parse(validDiagnostic)).toEqual(validDiagnostic);
		expect(
			ProviderDiagnosticSchema.parse({
				reference: "cf-ray-abc123",
				occurredAtUtc: "2026-08-13T09:15:30.000Z",
				recovery: "retry",
			}),
		).toEqual({
			reference: "cf-ray-abc123",
			occurredAtUtc: "2026-08-13T09:15:30.000Z",
			recovery: "retry",
		});
	});

	it.each([
		["providerMessage", "Quota exceeded for project 1234"],
		["httpStatus", 403],
		["placeId", "ChIJ-private"],
		["email", "traveler@example.com"],
		["rawPayload", { data: [] }],
		["accessKey", "secret"],
	])("rejects a diagnostic carrying %s", (field, value) => {
		expect(() => ProviderDiagnosticSchema.parse({ ...validDiagnostic, [field]: value })).toThrow();
	});

	it("keeps provider names, credentials, and payload text out of the taxonomy itself", () => {
		const schema = source("packages/data-ops/src/diagnostics/schema.ts");
		expect(schema).not.toMatch(/aviationstack|google|access_key|X-Goog-Api-Key|api[_-]?key/i);
	});

	it("classifies only from an allowlisted documented code, never from free text", () => {
		const diagnostics = source("apps/data-service/src/providers/diagnostics.ts");
		// Every documented code must be looked up in a constant record; a substring or
		// regex match over provider text would let unattributed failures be mislabelled.
		expect(diagnostics).toMatch(
			/AVIATIONSTACK_SIGNALS: Readonly<Record<string, ProviderErrorSignal>>/,
		);
		expect(diagnostics).toMatch(
			/GOOGLE_STATUS_SIGNALS: Readonly<Record<string, ProviderErrorSignal>>/,
		);
		expect(diagnostics).toMatch(
			/GOOGLE_REASON_SIGNALS: Readonly<Record<string, ProviderErrorSignal>>/,
		);
		expect(diagnostics).not.toMatch(/\.includes\(|\.match\(|toLowerCase\(\)\.indexOf/);
	});

	it("never retains a provider error body beyond the normalized signal", () => {
		const http = source("apps/data-service/src/providers/live-http.ts");
		expect(http).toMatch(/readProviderErrorSignal/);
		expect(http).not.toMatch(/message:\s*(body|text|await)/);
		expect(http).not.toMatch(/rawPayload|providerMessage/);
	});

	it("keeps diagnostic rendering free of provider payload fields in the browser", () => {
		const notice = source("apps/user-application/src/components/ui/provider-failure-notice.tsx");
		expect(notice).not.toMatch(/httpStatus|rawPayload|placeId|latitude|longitude|email/);
		expect(notice).toMatch(/diagnostic\.reference/);
	});
});
