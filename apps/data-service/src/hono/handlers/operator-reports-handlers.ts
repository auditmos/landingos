import { getAuth } from "@repo/data-ops/auth/server";
import { getDb } from "@repo/data-ops/database/setup";
import { getUserRoleById } from "@repo/data-ops/operator";
import {
	listSafetyReportQueue,
	type SafetyReportQueueQuery,
	SafetyReportQueueQuerySchema,
	type SafetyReportQueueResponse,
} from "@repo/data-ops/safety";
import { Hono } from "hono";
import {
	type OperatorOnlyOptions,
	type OperatorSession,
	operatorOnly,
} from "../middleware/operator-only";

interface OperatorReportsHandlerDependencies extends OperatorOnlyOptions {
	listReports(query: SafetyReportQueueQuery): Promise<SafetyReportQueueResponse>;
}

const defaultDependencies: OperatorReportsHandlerDependencies = {
	listReports: (query) => listSafetyReportQueue(getDb(), query),
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
	for (const key of ["reason", "limit", "offset"] as const) {
		const value = url.searchParams.get(key);
		if (value !== null) query[key] = value;
	}
	return query;
}

export function createOperatorReportsHandlers(
	dependencies: OperatorReportsHandlerDependencies = defaultDependencies,
) {
	const reports = new Hono<{ Bindings: Env }>();
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

	return reports;
}

export default createOperatorReportsHandlers();
