import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { Route } from "../routes/signup";

/*
 * Regression assumptions:
 * - input: any visitor navigating to the legacy /signup path;
 * - output: the route never renders an OTP form of its own — it hands the
 *   visitor to /signin, whose SigninGate is the single authenticated-visitor
 *   guard;
 * - boundary: an already-authenticated visitor must not be shown a live OTP
 *   form, which is exactly what the un-gated <EmailAuth /> render did;
 * - out of scope: OTP issuance and session recovery, covered by signin-gate.
 */
describe("/signup", () => {
	it("redirects to /signin instead of rendering an ungated OTP form", () => {
		const beforeLoad = Route.options.beforeLoad;
		expect(typeof beforeLoad).toBe("function");

		let thrown: unknown;
		try {
			(beforeLoad as () => void)();
		} catch (error) {
			thrown = error;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { options?: { to?: string } }).options?.to).toBe("/signin");
	});

	it("renders no component of its own", () => {
		expect(Route.options.component).toBeUndefined();
	});
});
