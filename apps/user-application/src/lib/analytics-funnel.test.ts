// @vitest-environment jsdom

import { ANALYTICS_FUNNEL_HEADER } from "@repo/data-ops/analytics";
import {
	analyticsFunnelHeaders,
	captureAnalyticsFunnel,
	clearAnalyticsFunnel,
	loadAnalyticsFunnel,
} from "./analytics-funnel";

const FUNNEL_A = "00112233445566778899aabbccddeeff";
const FUNNEL_B = "10112233445566778899aabbccddeeff";

describe("browser-local opaque funnel continuity", () => {
	beforeEach(() => clearAnalyticsFunnel());

	it("stores only a valid server-created 128-bit ID and sends it on retries", () => {
		expect(analyticsFunnelHeaders()).toEqual({});
		captureAnalyticsFunnel(
			new Response(null, { headers: { [ANALYTICS_FUNNEL_HEADER]: FUNNEL_A } }),
		);
		expect(loadAnalyticsFunnel()).toBe(FUNNEL_A);
		expect(analyticsFunnelHeaders()).toEqual({ [ANALYTICS_FUNNEL_HEADER]: FUNNEL_A });
		expect(JSON.stringify(sessionStorage)).not.toMatch(/email|address|place|message/i);
	});

	it("replaces an abandoned funnel from a response and rejects malformed values", () => {
		captureAnalyticsFunnel(
			new Response(null, { headers: { [ANALYTICS_FUNNEL_HEADER]: FUNNEL_A } }),
		);
		captureAnalyticsFunnel(
			new Response(null, { headers: { [ANALYTICS_FUNNEL_HEADER]: FUNNEL_B } }),
		);
		expect(loadAnalyticsFunnel()).toBe(FUNNEL_B);
		captureAnalyticsFunnel(
			new Response(null, {
				headers: { [ANALYTICS_FUNNEL_HEADER]: "traveler@example.com" },
			}),
		);
		expect(loadAnalyticsFunnel()).toBe(FUNNEL_B);
	});

	it("clears the opaque browser identifier after account deletion", () => {
		captureAnalyticsFunnel(
			new Response(null, { headers: { [ANALYTICS_FUNNEL_HEADER]: FUNNEL_A } }),
		);
		clearAnalyticsFunnel();
		expect(analyticsFunnelHeaders()).toEqual({});
	});
});
