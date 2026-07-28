import { useQuery } from "@tanstack/react-query";
import { getViewerContext } from "@/core/functions/viewer";

/**
 * Viewer capability flags for gating navigation and UI. Defaults to the least
 * privileged shape while the query is in flight so operator-only surfaces stay
 * hidden until confirmed.
 */
export function useViewerContext() {
	const query = useQuery({
		queryKey: ["viewer", "context"],
		queryFn: () => getViewerContext(),
		staleTime: 5 * 60 * 1000,
	});
	return {
		isOperator: query.data?.isOperator ?? false,
		isLoading: query.isPending,
	};
}
