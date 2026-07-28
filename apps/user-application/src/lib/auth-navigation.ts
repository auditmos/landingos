import { loadRoomIntent } from "./room-intent";

type ReplaceDocument = (path: "/" | "/app") => void;

export function completeAuthenticationNavigation(
	replaceDocument: ReplaceDocument = (path) => window.location.replace(path),
): void {
	replaceDocument(loadRoomIntent() ? "/app" : "/");
}
