import type { RoomListing } from "@repo/data-ops/room";
import { PlaneLanding } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatArrivalInRome } from "@/lib/flight-planner";

function flightTitle(listing: RoomListing): string {
	const flight = listing.flight;
	if (!flight) return "Twój lot";
	return `${flight.marketingCarrierName} ${flight.marketingCarrierCode}${flight.marketingFlightNumber}`;
}

function routeLabel(listing: RoomListing): string | null {
	const flight = listing.flight;
	if (!flight) return null;
	const origin = flight.originIata === "ZZZ" ? "Polska" : flight.originIata;
	return `${origin} → ${flight.destinationIata}`;
}

function formatRoomClosing(closesAt: string, now = new Date()): string {
	const minutes = Math.max(1, Math.round((new Date(closesAt).getTime() - now.getTime()) / 60_000));
	const relative = new Intl.RelativeTimeFormat("pl", { numeric: "always" });
	if (minutes < 60) return `Pokój zamyka się ${relative.format(minutes, "minute")}`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `Pokój zamyka się ${relative.format(hours, "hour")}`;
	return `Pokój zamyka się ${relative.format(Math.round(hours / 24), "day")}`;
}

export function RoomGateway({
	rooms,
	onSelect,
}: {
	rooms: RoomListing[] | null;
	onSelect: (roomId: string) => void;
}) {
	if (rooms) return <MyFlightsList rooms={rooms} onSelect={onSelect} />;
	return (
		<Button asChild>
			<a href="/">Wróć do planera</a>
		</Button>
	);
}

function MyFlightsList({
	rooms,
	onSelect,
}: {
	rooms: RoomListing[];
	onSelect: (roomId: string) => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-xl">
					<PlaneLanding className="size-5" />
					Moje loty
				</CardTitle>
				<CardDescription>Wybierz lot, aby wejść do jego pokoju.</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-2">
				{rooms.map((listing) => (
					<button
						key={listing.id}
						type="button"
						onClick={() => onSelect(listing.id)}
						className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
					>
						<span className="min-w-0">
							<span className="block truncate font-semibold text-foreground">
								{flightTitle(listing)}
							</span>
							{routeLabel(listing) ? (
								<span className="block text-sm text-muted-foreground">{routeLabel(listing)}</span>
							) : null}
						</span>
						<span className="shrink-0 text-right">
							{listing.flight ? (
								<span className="block text-sm text-foreground">
									Przylot {formatArrivalInRome(listing.flight.scheduledArrivalUtc)}
								</span>
							) : null}
							<span className="block text-xs text-muted-foreground">
								{formatRoomClosing(listing.closesAt)}
							</span>
						</span>
					</button>
				))}
			</CardContent>
		</Card>
	);
}
