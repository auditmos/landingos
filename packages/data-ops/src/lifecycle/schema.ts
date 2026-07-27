import { z } from "zod";
import { RoomIdSchema } from "@/room/schema";

export const AccountRedactionRequestSchema = z.strictObject({
	rooms: z
		.array(
			z.strictObject({
				roomId: RoomIdSchema,
				coordinatorKey: z.string().min(1).max(200),
			}),
		)
		.min(1)
		.max(100),
});

export type AccountRedactionRequest = z.infer<typeof AccountRedactionRequestSchema>;
