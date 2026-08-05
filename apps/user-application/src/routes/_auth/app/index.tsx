import { createFileRoute } from "@tanstack/react-router";
import { FlightRoom } from "@/components/room/flight-room";

export const Route = createFileRoute("/_auth/app/")({
	validateSearch: (search: Record<string, unknown>): { roomId?: string } => ({
		roomId:
			typeof search.roomId === "string" && search.roomId.length > 0 ? search.roomId : undefined,
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const { roomId } = Route.useSearch();
	return <FlightRoom roomId={roomId} />;
}
