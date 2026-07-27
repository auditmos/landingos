import { createFileRoute } from "@tanstack/react-router";
import { OperatorCatalogConsole } from "@/components/operator/operator-catalog-console";

export const Route = createFileRoute("/_auth/operator/")({
	component: OperatorCatalogConsole,
});
