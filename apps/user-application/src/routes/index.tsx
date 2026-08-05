import { createFileRoute } from "@tanstack/react-router";
import { FlightPlanner } from "@/components/flight/flight-planner";

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>): { flightNumber?: string } => ({
		flightNumber:
			typeof search.flightNumber === "string" && search.flightNumber.length > 0
				? search.flightNumber
				: undefined,
	}),
	component: LandingPage,
});

function LandingPage() {
	const { flightNumber } = Route.useSearch();
	return <FlightPlanner initialFlightNumber={flightNumber} />;
}
