import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useViewerContext } from "./use-viewer";

/**
 * Keeps operators out of the traveler surfaces. An operator account is staff,
 * not a customer — it has no flight, so the room and flight list would only
 * ever show an empty planner prompt.
 *
 * Returns whether a redirect is in flight, so the caller can render nothing
 * instead of flashing a traveler screen on the way out.
 */
export function useOperatorConsoleRedirect(): boolean {
	const { isOperator, isLoading } = useViewerContext();
	const navigate = useNavigate();
	const redirecting = !isLoading && isOperator;

	useEffect(() => {
		if (redirecting) {
			navigate({ to: "/operator", replace: true });
		}
	}, [redirecting, navigate]);

	return redirecting;
}
