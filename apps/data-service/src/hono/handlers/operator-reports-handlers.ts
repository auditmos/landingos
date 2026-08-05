import { getAuth } from "@repo/data-ops/auth/server";
import { getDb } from "@repo/data-ops/database/setup";
import { getUserRoleById } from "@repo/data-ops/operator";
import {
	listSafetyReportQueue,
	SafetyReportIdSchema,
	type SafetyReportQueueItem,
	type SafetyReportQueueQuery,
	SafetyReportQueueQuerySchema,
	type SafetyReportQueueResponse,
	type SafetyReportStatus,
	SafetyReportStatusPatchSchema,
	setSafetyReportStatus,
} from "@repo/data-ops/safety";
import { Hono } from "hono";
import {
	type OperatorOnlyOptions,
	type OperatorSession,
	type OperatorVariables,
	operatorOnly,
} from "../middleware/operator-only";

interface OperatorReportsHandlerDependencies extends OperatorOnlyOptions {
	listReports(query: SafetyReportQueueQuery): Promise<SafetyReportQueueResponse>;
	setReportStatus(input: {
		reportId: string;
		operatorId: string;
		status: SafetyReportStatus;
	}): Promise<{ report: SafetyReportQueueItem; changed: boolean } | null>;
}

const defaultDependencies: OperatorReportsHandlerDependencies = {
	listReports: (query) => listSafetyReportQueue(getDb(), query),
	setReportStatus: (input) => setSafetyReportStatus(getDb(), input),
	getSession: async (request) =>
		(await getAuth().api.getSession({
			headers: request.headers,
		})) as OperatorSession | null,
	getUserRole: (userId) => getUserRoleById(getDb(), userId),
};

/**
 * Reads only the filters the queue understands. Unknown query parameters are
 * dropped rather than rejected, so a stale bookmark still opens the queue.
 */
function queueQuery(url: URL): Record<string, string> {
	const query: Record<string, string> = {};
	for (const key of ["status", "reason", "limit", "offset"] as const) {
		const value = url.searchParams.get(key);
		if (value !== null) query[key] = value;
	}
	return query;
}

export function createOperatorReportsHandlers(
	dependencies: OperatorReportsHandlerDependencies = defaultDependencies,
) {
	const reports = new Hono<{ Bindings: Env; Variables: OperatorVariables }>();
	reports.use("*", operatorOnly(dependencies));

	reports.get("/", async (c) => {
		const parsed = SafetyReportQueueQuerySchema.safeParse(queueQuery(new URL(c.req.url)));
		if (!parsed.success) {
			return c.json(
				{ code: "REPORT_QUEUE_QUERY_INVALID", error: "Popraw filtry kolejki zgłoszeń." },
				400,
			);
		}
		return c.json(await dependencies.listReports(parsed.data));
	});

	reports.patch("/:id", async (c) => {
		const reportId = SafetyReportIdSchema.safeParse(c.req.param("id"));
		if (!reportId.success) {
			return c.json({ code: "REPORT_NOT_FOUND", error: "Nie znaleziono zgłoszenia." }, 404);
		}
		const parsed = SafetyReportStatusPatchSchema.safeParse(
			await c.req.json().catch(() => undefined),
		);
		if (!parsed.success) {
			return c.json(
				{ code: "REPORT_STATUS_INVALID", error: "Wskaż prawidłowy status zgłoszenia." },
				400,
			);
		}
		const result = await dependencies.setReportStatus({
			reportId: reportId.data,
			operatorId: c.get("operatorUserId"),
			status: parsed.data.status,
		});
		if (!result) {
			return c.json({ code: "REPORT_NOT_FOUND", error: "Nie znaleziono zgłoszenia." }, 404);
		}
		return c.json(result.report);
	});

	return reports;
}

export default createOperatorReportsHandlers();
