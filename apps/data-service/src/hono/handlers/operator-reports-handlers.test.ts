import type {
	SafetyReportQueueItem,
	SafetyReportQueueResponse,
	SafetyReportStatus,
} from "@repo/data-ops/safety";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createOperatorReportsHandlers } from "./operator-reports-handlers";

const memberReport: SafetyReportQueueItem = {
	id: "018f4c8e-5697-7df4-8f6e-c7644b137e71",
	roomId: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
	flightDesignator: "FR1234",
	departureLocalDate: "2026-09-14",
	reporterPseudonym: "Alicja BGY",
	targetPseudonym: "Bartek BGY",
	messageId: null,
	reason: "harassment_or_discrimination",
	note: "Proszę sprawdzić.",
	status: "open",
	evidenceSnapshot: null,
	createdAt: "2026-09-14T07:10:00.000Z",
	resolvedAt: null,
	resolvedByPseudonym: null,
};

const messageReport: SafetyReportQueueItem = {
	...memberReport,
	id: "018f4c8e-5697-7df4-8f6e-c7644b137e72",
	messageId: "018f4c8e-5697-7df4-8f6e-c7644b137e61",
	reason: "commercial_spam",
	note: null,
	evidenceSnapshot: {
		messageText: "Niewłaściwa wiadomość",
		authorPseudonym: "Bartek BGY",
		originalMessageAt: "2026-09-14T07:00:00.000Z",
	},
	createdAt: "2026-09-14T07:20:00.000Z",
};

function buildApp() {
	const listReports = vi.fn(
		async (): Promise<SafetyReportQueueResponse> => ({
			reports: [messageReport, memberReport],
			hasMore: false,
		}),
	);
	const setReportStatus = vi.fn(
		async (input: { reportId: string; operatorId: string; status: SafetyReportStatus }) =>
			input.reportId === memberReport.id
				? {
						report: {
							...memberReport,
							status: input.status,
							resolvedAt: input.status === "resolved" ? "2026-09-14T09:00:00.000Z" : null,
							resolvedByPseudonym: input.status === "resolved" ? "Operator BGY" : null,
						},
						changed: true,
					}
				: null,
	);
	const handlers = createOperatorReportsHandlers({
		listReports,
		setReportStatus,
		getSession: async (request) => {
			const cookie = request.headers.get("cookie");
			if (cookie === "better-auth.session_token=operator") return { user: { id: "operator" } };
			if (cookie === "better-auth.session_token=user") return { user: { id: "user" } };
			return null;
		},
		getUserRole: async (id) => (id === "operator" ? "operator" : "user"),
	});
	const app = new Hono();
	app.route("/operator/reports", handlers);
	return { app, listReports, setReportStatus };
}

function patch(body: unknown) {
	return {
		method: "PATCH",
		headers: { ...operatorCookie, "content-type": "application/json" },
		body: JSON.stringify(body),
	};
}

const operatorCookie = { cookie: "better-auth.session_token=operator" };

describe("operator reports Hono API", () => {
	it("rejects unauthenticated reads with 401 before touching the safety store", async () => {
		const { app, listReports } = buildApp();
		const response = await app.request("/operator/reports");
		expect(response.status).toBe(401);
		expect(listReports).not.toHaveBeenCalled();
	});

	it("rejects authenticated travelers with 403 before touching the safety store", async () => {
		const { app, listReports } = buildApp();
		const response = await app.request("/operator/reports", {
			headers: { cookie: "better-auth.session_token=user" },
		});
		expect(response.status).toBe(403);
		expect(listReports).not.toHaveBeenCalled();
	});

	it("returns the queue to an operator with defaulted paging", async () => {
		const { app, listReports } = buildApp();
		const response = await app.request("/operator/reports", { headers: operatorCookie });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			reports: [messageReport, memberReport],
			hasMore: false,
		});
		expect(listReports).toHaveBeenCalledWith({ limit: 25, offset: 0 });
	});

	it("passes through the supported filters and ignores unknown query parameters", async () => {
		const { app, listReports } = buildApp();
		const response = await app.request(
			"/operator/reports?reason=commercial_spam&limit=5&offset=10&unexpected=1",
			{ headers: operatorCookie },
		);
		expect(response.status).toBe(200);
		expect(listReports).toHaveBeenCalledWith({
			reason: "commercial_spam",
			limit: 5,
			offset: 10,
		});
	});

	it("rejects an unusable filter with 400 instead of silently widening the queue", async () => {
		const { app, listReports } = buildApp();
		for (const search of [
			"?reason=not_a_reason",
			"?status=archived",
			"?limit=0",
			"?limit=101",
			"?offset=-1",
		]) {
			const response = await app.request(`/operator/reports${search}`, { headers: operatorCookie });
			expect(response.status).toBe(400);
		}
		expect(listReports).not.toHaveBeenCalled();
	});

	it("closes a report and records the acting operator", async () => {
		const { app, setReportStatus } = buildApp();
		const response = await app.request(
			`/operator/reports/${memberReport.id}`,
			patch({ status: "resolved" }),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			id: memberReport.id,
			status: "resolved",
			resolvedAt: "2026-09-14T09:00:00.000Z",
			resolvedByPseudonym: "Operator BGY",
		});
		expect(setReportStatus).toHaveBeenCalledWith({
			reportId: memberReport.id,
			operatorId: "operator",
			status: "resolved",
		});
	});

	it("reopens a closed report and clears the decision trail", async () => {
		const { app } = buildApp();
		const response = await app.request(
			`/operator/reports/${memberReport.id}`,
			patch({ status: "open" }),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "open",
			resolvedAt: null,
			resolvedByPseudonym: null,
		});
	});

	it("refuses to mutate a report for anyone who is not an operator", async () => {
		const { app, setReportStatus } = buildApp();
		const anonymous = await app.request(`/operator/reports/${memberReport.id}`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ status: "resolved" }),
		});
		const traveler = await app.request(`/operator/reports/${memberReport.id}`, {
			method: "PATCH",
			headers: {
				cookie: "better-auth.session_token=user",
				"content-type": "application/json",
			},
			body: JSON.stringify({ status: "resolved" }),
		});
		expect(anonymous.status).toBe(401);
		expect(traveler.status).toBe(403);
		expect(setReportStatus).not.toHaveBeenCalled();
	});

	it("rejects an unknown report, a malformed id, and an unsupported status", async () => {
		const { app, setReportStatus } = buildApp();
		const unknown = await app.request(
			"/operator/reports/018f4c8e-5697-7df4-8f6e-c7644b137e99",
			patch({ status: "resolved" }),
		);
		expect(unknown.status).toBe(404);

		const malformed = await app.request("/operator/reports/not-a-uuid", patch({ status: "open" }));
		expect(malformed.status).toBe(404);

		for (const body of [{ status: "archived" }, { status: "resolved", note: "x" }, {}]) {
			const response = await app.request(`/operator/reports/${memberReport.id}`, patch(body));
			expect(response.status).toBe(400);
		}
		expect(setReportStatus).toHaveBeenCalledTimes(1);
	});
});
