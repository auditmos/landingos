import { createFileRoute } from "@tanstack/react-router";
import { MyFlightsPage } from "@/components/room/my-flights-list";
import { useOperatorConsoleRedirect } from "@/lib/use-operator-redirect";

export const Route = createFileRoute("/_auth/app/flights")({
	component: RouteComponent,
});

function RouteComponent() {
	if (useOperatorConsoleRedirect()) return null;

	return <MyFlightsPage />;
}
