// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeAuthenticationNavigation } from "./auth-navigation";
import { saveRoomIntent } from "./room-intent";

/*
 * Regression assumptions:
 * - input: the OTP call has succeeded and sessionStorage may contain a valid,
 *   redacted room intent;
 * - output: authentication completes through a full-document replacement to
 *   /app when that intent exists, otherwise to /;
 * - boundary: corrupt or absent browser state is not a room-entry intent;
 * - out of scope: OTP issuance/expiry, provider calls, room persistence, and
 *   WebSocket delivery are covered by their own boundaries.
 */
describe("post-authentication navigation", () => {
	beforeEach(() => sessionStorage.clear());

	it("replaces the document with the protected room when a redacted room intent exists", () => {
		saveRoomIntent({
			flightInstanceId: "flight-fr1234-2026-09-14",
			selection: {
				kind: "public_transport",
				badges: ["recommended"],
				modes: ["bus"],
				operatorNames: ["Airport Bus Express"],
			},
		});
		const replaceDocument = vi.fn();

		completeAuthenticationNavigation(replaceDocument);

		expect(replaceDocument).toHaveBeenCalledOnce();
		expect(replaceDocument).toHaveBeenCalledWith("/app");
	});

	it.each([
		["absent", null],
		["corrupt", "{not-json"],
	])("replaces the document with the planner when room intent is %s", (_state, rawIntent) => {
		if (rawIntent) sessionStorage.setItem("landingos.room-intent", rawIntent);
		const replaceDocument = vi.fn();

		completeAuthenticationNavigation(replaceDocument);

		expect(replaceDocument).toHaveBeenCalledWith("/");
	});
});
