import { createFileRoute } from "@tanstack/react-router";
import { FlightPlanner } from "@/components/flight/flight-planner";

export const Route = createFileRoute("/")({
	component: LandingPage,
});

function LandingPage() {
	return <FlightPlanner />;
}
