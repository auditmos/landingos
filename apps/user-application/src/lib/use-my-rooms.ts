import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { listMyRooms } from "./room-api";

const OPEN_ROOMS_QUERY_KEY = ["rooms", "mine"] as const;

/** Count of the viewer's open flight rooms, shared by the navigation badges. */
export function useOpenRoomCount(): number {
	const query = useQuery({
		queryKey: OPEN_ROOMS_QUERY_KEY,
		queryFn: () => listMyRooms(),
		staleTime: 60_000,
	});
	return query.data?.length ?? 0;
}

/** Refreshes the navigation badge immediately after membership changes (join, room close). */
export function useRefreshOpenRoomCount(): () => void {
	const queryClient = useQueryClient();
	return useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: OPEN_ROOMS_QUERY_KEY });
	}, [queryClient]);
}
