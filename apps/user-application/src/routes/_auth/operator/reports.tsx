import { createFileRoute } from "@tanstack/react-router";
import { OperatorReportsConsole } from "@/components/operator/operator-reports-console";

export const Route = createFileRoute("/_auth/operator/reports")({
	component: OperatorReportsConsole,
});
