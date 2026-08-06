import { createFileRoute } from "@tanstack/react-router";
import { FlightRoom } from "@/components/room/flight-room";
import { useOperatorConsoleRedirect } from "@/lib/use-operator-redirect";

export const Route = createFileRoute("/_auth/app/")({
	validateSearch: (search: Record<string, unknown>): { roomId?: string } => ({
		roomId:
			typeof search.roomId === "string" && search.roomId.length > 0 ? search.roomId : undefined,
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const { roomId } = Route.useSearch();
	const redirecting = useOperatorConsoleRedirect();

	if (redirecting) return null;

	return <FlightRoom roomId={roomId} />;
}
