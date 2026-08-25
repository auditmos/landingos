import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * The one unauthenticated body the room, safety, and operator families answer with.
 * Frontends surface `code` as `error.name`, so a second spelling of the same state is
 * a wire break, not a cosmetic difference.
 */
export const UNAUTHORIZED_BODY = {
	code: "UNAUTHORIZED",
	error: "Wymagane jest zalogowanie.",
} as const;

/** The one unparsable-room-id body, shared by every family that takes a `:roomId`. */
export function invalidRoomId(c: Context) {
	return c.json({ code: "ROOM_ID_INVALID", error: "Nieprawidłowy identyfikator pokoju." }, 400);
}

interface TypedServiceError {
	code: string;
	status: ContentfulStatusCode;
	message: string;
}

/**
 * Builds a handler's mapper for exactly one typed service error class: its `code` and
 * `status` become the response, anything else propagates to the global `onError`. One
 * implementation of the `{ code, error }` wire shape, still narrowed per module.
 */
export function serviceErrorResponder<E extends TypedServiceError>(
	errorClass: abstract new (...args: never[]) => E,
) {
	return (c: Context, error: unknown) => {
		if (!(error instanceof errorClass)) throw error;
		return c.json({ code: error.code, error: error.message }, error.status);
	};
}
