import { createFileRoute } from "@tanstack/react-router";
import { FlightRoom } from "@/components/room/flight-room";

export const Route = createFileRoute("/_auth/app/")({
	component: RouteComponent,
});

function RouteComponent() {
	return <FlightRoom />;
}
