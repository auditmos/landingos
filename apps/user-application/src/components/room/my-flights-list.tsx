import { canonicalFlightDesignator, formatFlightLabel } from "@repo/data-ops/flight";
import type { PastFlightListing, RoomListing } from "@repo/data-ops/room";
import { History, PlaneLanding } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatArrivalInRome, formatDepartureDate } from "@/lib/flight-planner";
import { useMyRooms, usePastFlights } from "@/lib/use-my-rooms";

function flightTitle(flight: RoomListing["flight"]): string {
	if (!flight) return "Twój lot";
	return formatFlightLabel(flight);
}

function routeLabel(flight: RoomListing["flight"]): string | null {
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

function replanHref(flight: PastFlightListing["flight"]): string {
	const flightNumber = canonicalFlightDesignator(flight);
	return `/?flightNumber=${encodeURIComponent(flightNumber)}`;
}

function roomHref(roomId: string): string {
	return `/app?roomId=${encodeURIComponent(roomId)}`;
}

/** The /app fallback when the traveler has no open room. */
export function RoomGateway({ pastFlights }: { pastFlights: PastFlightListing[] }) {
	return (
		<div className="space-y-5">
			<Button asChild>
				<a href="/">Wróć do planera</a>
			</Button>
			{pastFlights.length > 0 ? <PastFlightsPanel flights={pastFlights} /> : null}
		</div>
	);
}

function MyFlightsList({ rooms }: { rooms: RoomListing[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-xl">
					<PlaneLanding className="size-5" />
					Otwarte pokoje
				</CardTitle>
				<CardDescription>Wybierz lot, aby wejść do jego pokoju.</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-2">
				{rooms.map((listing) => (
					<a
						key={listing.id}
						href={roomHref(listing.id)}
						className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
					>
						<span className="min-w-0">
							<span className="block truncate font-semibold text-foreground">
								{flightTitle(listing.flight)}
							</span>
							{routeLabel(listing.flight) ? (
								<span className="block text-sm text-muted-foreground">
									{routeLabel(listing.flight)}
								</span>
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
					</a>
				))}
			</CardContent>
		</Card>
	);
}

function PastFlightsPanel({ flights }: { flights: PastFlightListing[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-xl">
					<History className="size-5" />
					Poprzednie loty
				</CardTitle>
				<CardDescription>
					Pokoje zakończonych lotów są zamykane, a wiadomości usuwane. Możesz za to szybko
					zaplanować ten sam lot ponownie — pokazujemy loty z ostatnich 30 dni.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-2">
				{flights.map((item) => (
					<div
						key={item.flight.id}
						className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
					>
						<span className="min-w-0">
							<span className="block truncate font-semibold text-foreground">
								{flightTitle(item.flight)}
							</span>
							<span className="block text-sm text-muted-foreground">
								{routeLabel(item.flight)} · {formatDepartureDate(item.flight.departureLocalDate)}
							</span>
						</span>
						<Button asChild variant="outline" size="sm" className="shrink-0">
							<a href={replanHref(item.flight)}>Zaplanuj ponownie</a>
						</Button>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

/** The /app/flights page: open rooms plus recently closed flights to replan. */
export function MyFlightsPage() {
	const rooms = useMyRooms();
	const past = usePastFlights();

	return (
		<section className="mx-auto max-w-3xl space-y-5">
			<div>
				<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Moje loty</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Twoje otwarte pokoje lotów i ostatnio zakończone podróże.
				</p>
			</div>

			{rooms.isPending ? <p aria-live="polite">Wczytujemy Twoje loty…</p> : null}

			{rooms.data && rooms.data.length > 0 ? <MyFlightsList rooms={rooms.data} /> : null}

			{rooms.data && rooms.data.length === 0 ? (
				<Card>
					<CardContent className="space-y-3 pt-6">
						<p className="text-sm text-muted-foreground">
							Nie masz teraz otwartego pokoju lotu. Zaplanuj podróż, aby dołączyć.
						</p>
						<Button asChild>
							<a href="/">Wróć do planera</a>
						</Button>
					</CardContent>
				</Card>
			) : null}

			{past.data && past.data.length > 0 ? <PastFlightsPanel flights={past.data} /> : null}
		</section>
	);
}
