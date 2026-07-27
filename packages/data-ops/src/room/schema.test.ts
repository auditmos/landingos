import { describe, expect, it } from "vitest";
import {
	ConnectionAttachmentSchema,
	PublicRoomMemberSchema,
	RoomMessageCreateRequestSchema,
	RoomSelectionUpdateRequestSchema,
} from "./schema";

const publicTransportSelection = {
	kind: "public_transport",
	badges: ["recommended", "fastest"],
	modes: ["bus", "train"],
	operatorNames: ["Airport Bus Express", "Trenord"],
} as const;

describe("flight room public contracts", () => {
	it("returns exactly pseudonym and the redacted selection allowlist", () => {
		const member = PublicRoomMemberSchema.parse({
			pseudonym: "Podróżnik 7",
			selection: publicTransportSelection,
		});

		expect(Object.keys(member)).toEqual(["pseudonym", "selection"]);
		expect(Object.keys(member.selection ?? {})).toEqual([
			"kind",
			"badges",
			"modes",
			"operatorNames",
		]);
		expect(JSON.stringify(member)).not.toMatch(
			/email|userId|role|consent|destination|placeId|latitude|longitude|provider/i,
		);
	});

	it("rejects private or commercial fields instead of silently stripping them", () => {
		for (const forbidden of [
			{ destination: "Via Torino 42" },
			{ placeId: "private-place" },
			{ coordinates: { latitude: 45.46, longitude: 9.19 } },
			{ fareMinor: 4_500 },
			{ bookingUrl: "https://taxi.example" },
			{ meetingAddress: "Terminal 1" },
		]) {
			expect(
				RoomSelectionUpdateRequestSchema.safeParse({
					selection: { ...publicTransportSelection, ...forbidden },
				}).success,
			).toBe(false);
		}
		expect(
			RoomSelectionUpdateRequestSchema.safeParse({
				selection: { kind: "shared_taxi", settlement: "cash" },
			}).success,
		).toBe(false);
	});

	it("keeps hibernation attachments to room, user, and the direct close boundary", () => {
		const attachment = ConnectionAttachmentSchema.parse({
			roomId: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
			userId: "user-1",
			closesAt: "2026-09-15T08:20:00.000Z",
		});
		expect(Object.keys(attachment)).toEqual(["roomId", "userId", "closesAt"]);
		expect(
			ConnectionAttachmentSchema.safeParse({
				...attachment,
				email: "private@example.com",
			}).success,
		).toBe(false);
	});
});

describe("flight room message boundaries", () => {
	it("trims and normalizes valid plain text", () => {
		expect(
			RoomMessageCreateRequestSchema.parse({
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
				content: "  Do zobaczenia na przystanku!  ",
			}).content,
		).toBe("Do zobaczenia na przystanku!");
	});

	it("accepts exactly 1 and 1000 Unicode code points", () => {
		for (const content of ["🙂", "🙂".repeat(1_000)]) {
			expect(
				RoomMessageCreateRequestSchema.safeParse({
					clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
					content,
				}).success,
			).toBe(true);
		}
	});

	it("rejects empty and 1001-code-point content with a Polish error", () => {
		for (const content of ["   ", "🙂".repeat(1_001)]) {
			const result = RoomMessageCreateRequestSchema.safeParse({
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
				content,
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toMatch(/Wiadomość/);
			}
		}
	});
});
