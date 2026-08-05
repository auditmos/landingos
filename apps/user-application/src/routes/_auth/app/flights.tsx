import { createFileRoute } from "@tanstack/react-router";
import { MyFlightsPage } from "@/components/room/my-flights-list";

export const Route = createFileRoute("/_auth/app/flights")({
	component: MyFlightsPage,
});
