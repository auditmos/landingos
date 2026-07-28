import { getDb } from "@repo/data-ops/database/setup";
import { getUserRoleById } from "@repo/data-ops/operator";
import { createServerFn } from "@tanstack/react-start";
import { protectedFunctionMiddleware } from "@/core/middleware/auth";

export interface ViewerContext {
	isOperator: boolean;
}

/**
 * Returns coarse capability flags for the signed-in viewer. The raw `role`
 * field is `returned: false` in Better Auth, so the client never sees it — this
 * derives only the boolean the UI needs (whether to surface operator surfaces)
 * from the session on the server.
 */
export const getViewerContext = createServerFn({ method: "GET" })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }): Promise<ViewerContext> => {
		const role = await getUserRoleById(getDb(), context.userId);
		return { isOperator: role === "operator" };
	});
