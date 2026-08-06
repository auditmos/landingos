import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { FlightRoom } from "@/components/room/flight-room";
import { useViewerContext } from "@/lib/use-viewer";

export const Route = createFileRoute("/_auth/app/")({
	validateSearch: (search: Record<string, unknown>): { roomId?: string } => ({
		roomId:
			typeof search.roomId === "string" && search.roomId.length > 0 ? search.roomId : undefined,
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const { roomId } = Route.useSearch();
	const { isOperator, isLoading } = useViewerContext();
	const navigate = useNavigate();

	// Operators land on their console rather than the traveler room. A room deep
	// link still wins — operators are travelers too, and Moje loty links here
	// with an explicit roomId.
	const redirectToConsole = !isLoading && isOperator && !roomId;

	useEffect(() => {
		if (redirectToConsole) {
			navigate({ to: "/operator", replace: true });
		}
	}, [redirectToConsole, navigate]);

	if (redirectToConsole) return null;

	return <FlightRoom roomId={roomId} />;
}
