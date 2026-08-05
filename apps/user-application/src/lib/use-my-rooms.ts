import { useQuery } from "@tanstack/react-query";
import { listMyRooms } from "./room-api";

/** Count of the viewer's open flight rooms, shared by the navigation badges. */
export function useOpenRoomCount(): number {
	const query = useQuery({
		queryKey: ["rooms", "mine"],
		queryFn: () => listMyRooms(),
		staleTime: 60_000,
	});
	return query.data?.length ?? 0;
}
