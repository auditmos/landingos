import type { PastFlightListing, RoomListing } from "@repo/data-ops/room";
import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { fetchPastFlights, listMyRooms } from "./room-api";

const OPEN_ROOMS_QUERY_KEY = ["rooms", "mine"] as const;

/** The viewer's open flight rooms, shared by the Moje loty page and the badges. */
export function useMyRooms(): UseQueryResult<RoomListing[]> {
	return useQuery({
		queryKey: OPEN_ROOMS_QUERY_KEY,
		queryFn: () => listMyRooms(),
		staleTime: 60_000,
	});
}

/** Count of the viewer's open flight rooms, shown in the navigation badges. */
export function useOpenRoomCount(): number {
	return useMyRooms().data?.length ?? 0;
}

/** The viewer's recently closed flights (30-day window) for the replan shortcut. */
export function usePastFlights(): UseQueryResult<PastFlightListing[]> {
	return useQuery({
		queryKey: ["rooms", "past"],
		queryFn: () => fetchPastFlights(),
		staleTime: 60_000,
	});
}

/** Refreshes the navigation badge immediately after membership changes (join, room close). */
export function useRefreshOpenRoomCount(): () => void {
	const queryClient = useQueryClient();
	return useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: OPEN_ROOMS_QUERY_KEY });
	}, [queryClient]);
}
