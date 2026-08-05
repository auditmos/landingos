import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useViewerContext } from "@/lib/use-viewer";

export const Route = createFileRoute("/_auth/operator")({
	component: RouteComponent,
});

/**
 * Client-side gate shared by every operator screen. The server enforces the
 * same restriction on each API call — this only keeps the panel from flashing
 * for travelers who reach the URL directly.
 */
function RouteComponent() {
	const { isOperator, isLoading } = useViewerContext();
	const navigate = useNavigate();

	useEffect(() => {
		if (!isLoading && !isOperator) {
			navigate({ to: "/app" });
		}
	}, [isLoading, isOperator, navigate]);

	if (isLoading) {
		return (
			<output
				className="flex min-h-40 items-center justify-center"
				aria-label="Sprawdzanie uprawnień"
			>
				<div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
			</output>
		);
	}

	if (!isOperator) return null;

	return <Outlet />;
}
