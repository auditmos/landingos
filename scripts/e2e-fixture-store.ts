import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export type FixtureUser = {
	id: string;
	email: string;
	token: string;
	role: "user" | "operator";
	pseudonym: string | null;
	rulesAccepted: boolean;
	deleted: boolean;
};

export type RequestEvidence = {
	method: string;
	path: string;
	authorization: boolean;
	cookie: boolean;
	upgrade: boolean;
};

export type CatalogRecord = {
	id: string;
	originIata: "BGY";
	operatorName: string | null;
	serviceName: string | null;
	destinationStopCode: string | null;
	destinationStopName: string | null;
	durationMinutes: number | null;
	transferCount: number | null;
	walkingMinutes: number | null;
	walkingMeters: number | null;
	sourceUrl: string | null;
	checkedAt: string | null;
	costMinorMin: number | null;
	costMinorMax: number | null;
	purchaseUrl: string | null;
	publicationStatus: "draft" | "published";
	provenance: "operator_verified";
	freshness: "fresh" | "stale" | "incomplete";
	createdAt: string;
	updatedAt: string;
};

type RoomMemberRow = {
	user_id: string;
	pseudonym: string;
	selection: string | null;
};

type MessageRow = {
	id: string;
	client_message_id: string;
	pseudonym: string;
	content: string;
	created_at: string;
	user_id: string;
};

const ROOM_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_ROOM_ID = "20000000-0000-4000-8000-000000000002";
const CLOSES_AT = "2026-09-15T08:20:00.000Z";

function userFromRow(row: Record<string, unknown> | undefined): FixtureUser | undefined {
	if (!row) return;
	return {
		id: String(row.id),
		email: String(row.email),
		token: String(row.token),
		role: row.role === "operator" ? "operator" : "user",
		pseudonym: typeof row.pseudonym === "string" ? row.pseudonym : null,
		rulesAccepted: Boolean(row.rules_accepted),
		deleted: Boolean(row.deleted),
	};
}

export class FixtureStore {
	readonly db = new DatabaseSync(":memory:");
	readonly requests: RequestEvidence[] = [];
	readonly tickets = new Map<string, string>();
	private readonly otpByEmail = new Map<string, string>();
	private readonly flightAttempts = new Map<string, number>();

	constructor() {
		this.createSchema();
	}

	reset() {
		this.db.exec(`
			DELETE FROM reports;
			DELETE FROM blocks;
			DELETE FROM messages;
			DELETE FROM room_members;
			DELETE FROM catalog;
			DELETE FROM users;
		`);
		this.otpByEmail.clear();
		this.flightAttempts.clear();
		this.tickets.clear();
		this.requests.length = 0;
	}

	recordRequest(evidence: RequestEvidence) {
		this.requests.push(evidence);
	}

	requestOtp(email: string) {
		this.otpByEmail.set(email, "246810");
	}

	latestOtp(email: string) {
		return this.otpByEmail.get(email);
	}

	verifyOtp(email: string, otp: string): FixtureUser | undefined {
		if (this.latestOtp(email) !== otp) return;
		const existing = userFromRow(
			this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
				| Record<string, unknown>
				| undefined,
		);
		if (existing && !existing.deleted) return existing;
		const id = randomUUID();
		const token = `landingos-e2e-token-${randomUUID()}`;
		const role = email.startsWith("operator") ? "operator" : "user";
		this.db
			.prepare(
				"INSERT INTO users (id, email, token, role, pseudonym, rules_accepted, deleted) VALUES (?, ?, ?, ?, NULL, 0, 0)",
			)
			.run(id, email, token, role);
		return this.userByToken(token);
	}

	userByToken(token: string) {
		const row = this.db.prepare("SELECT * FROM users WHERE token = ? AND deleted = 0").get(token) as
			| Record<string, unknown>
			| undefined;
		return userFromRow(row);
	}

	userById(id: string) {
		const row = this.db.prepare("SELECT * FROM users WHERE id = ? AND deleted = 0").get(id) as
			| Record<string, unknown>
			| undefined;
		return userFromRow(row);
	}

	userByCookie(cookie: string | undefined) {
		const token = cookie
			?.split(";")
			.map((part) => part.trim())
			.find((part) => part.startsWith("landingos_e2e_session="))
			?.slice("landingos_e2e_session=".length);
		return token ? this.userByToken(decodeURIComponent(token)) : undefined;
	}

	updatePseudonym(userId: string, pseudonym: string) {
		this.db.prepare("UPDATE users SET pseudonym = ? WHERE id = ?").run(pseudonym, userId);
	}

	deleteAccount(userId: string) {
		this.db
			.prepare("UPDATE users SET deleted = 1, pseudonym = NULL, token = ? WHERE id = ?")
			.run(`revoked-${randomUUID()}`, userId);
		this.db.prepare("DELETE FROM room_members WHERE user_id = ?").run(userId);
	}

	nextFlightAttempt(flightNumber: string) {
		const next = (this.flightAttempts.get(flightNumber) ?? 0) + 1;
		this.flightAttempts.set(flightNumber, next);
		return next;
	}

	roomIdForFlight(flightInstanceId: string) {
		return flightInstanceId.includes("second") ? SECOND_ROOM_ID : ROOM_ID;
	}

	joinRoom(user: FixtureUser, flightInstanceId: string) {
		const roomId = this.roomIdForFlight(flightInstanceId);
		this.db
			.prepare(
				"INSERT OR IGNORE INTO room_members (room_id, user_id, flight_instance_id, pseudonym, selection) VALUES (?, ?, ?, ?, NULL)",
			)
			.run(roomId, user.id, flightInstanceId, user.pseudonym);
		return roomId;
	}

	updateSelection(roomId: string, userId: string, selection: unknown) {
		this.db
			.prepare("UPDATE room_members SET selection = ? WHERE room_id = ? AND user_id = ?")
			.run(JSON.stringify(selection), roomId, userId);
	}

	member(roomId: string, userId: string) {
		const row = this.db
			.prepare("SELECT pseudonym, selection FROM room_members WHERE room_id = ? AND user_id = ?")
			.get(roomId, userId) as { pseudonym: string; selection: string | null } | undefined;
		return row
			? { pseudonym: row.pseudonym, selection: row.selection ? JSON.parse(row.selection) : null }
			: undefined;
	}

	snapshot(roomId: string, user: FixtureUser) {
		const members = this.db
			.prepare(
				"SELECT user_id, pseudonym, selection FROM room_members WHERE room_id = ? ORDER BY pseudonym",
			)
			.all(roomId) as unknown as RoomMemberRow[];
		const own = members.find((row) => row.user_id === user.id);
		if (!own) return;
		const blocked = new Set(
			(
				this.db
					.prepare("SELECT target_user_id FROM blocks WHERE blocker_user_id = ?")
					.all(user.id) as Array<{ target_user_id: string }>
			).map((row) => row.target_user_id),
		);
		const messages = (
			this.db
				.prepare("SELECT * FROM messages WHERE room_id = ? ORDER BY created_at, id")
				.all(roomId) as unknown as MessageRow[]
		)
			.filter((row) => !blocked.has(row.user_id))
			.map((row) => ({
				id: row.id,
				clientMessageId: row.client_message_id,
				pseudonym: row.pseudonym,
				content: row.content,
				createdAt: row.created_at,
			}));
		const publicMember = (row: RoomMemberRow) => ({
			pseudonym: row.pseudonym,
			selection: row.selection ? JSON.parse(row.selection) : null,
		});
		const flightInstanceId = (
			this.db
				.prepare("SELECT flight_instance_id FROM room_members WHERE room_id = ? LIMIT 1")
				.get(roomId) as { flight_instance_id: string }
		).flight_instance_id;
		return {
			room: { id: roomId, flightInstanceId, closesAt: CLOSES_AT },
			member: publicMember(own),
			members: members.map(publicMember),
			messages,
		};
	}

	createMessage(roomId: string, user: FixtureUser, clientMessageId: string, content: string) {
		const existing = this.db
			.prepare("SELECT * FROM messages WHERE client_message_id = ?")
			.get(clientMessageId) as MessageRow | undefined;
		if (existing) return { message: this.publicMessage(existing), created: false };
		const row: MessageRow = {
			id: randomUUID(),
			client_message_id: clientMessageId,
			pseudonym: user.pseudonym ?? "Podróżny",
			content: content.trim(),
			created_at: new Date().toISOString(),
			user_id: user.id,
		};
		this.db
			.prepare(
				"INSERT INTO messages (id, client_message_id, room_id, user_id, pseudonym, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				row.id,
				row.client_message_id,
				roomId,
				row.user_id,
				row.pseudonym,
				row.content,
				row.created_at,
			);
		return { message: this.publicMessage(row), created: true };
	}

	acceptRules(userId: string) {
		this.db.prepare("UPDATE users SET rules_accepted = 1 WHERE id = ?").run(userId);
	}

	block(userId: string, targetPseudonym: string, active: boolean) {
		const target = this.db
			.prepare("SELECT id FROM users WHERE pseudonym = ?")
			.get(targetPseudonym) as { id: string } | undefined;
		if (!target) return false;
		if (active) {
			this.db
				.prepare("INSERT OR IGNORE INTO blocks (blocker_user_id, target_user_id) VALUES (?, ?)")
				.run(userId, target.id);
		} else {
			this.db
				.prepare("DELETE FROM blocks WHERE blocker_user_id = ? AND target_user_id = ?")
				.run(userId, target.id);
		}
		return true;
	}

	blockedPseudonyms(userId: string) {
		return (
			this.db
				.prepare(
					"SELECT users.pseudonym FROM blocks JOIN users ON users.id = blocks.target_user_id WHERE blocks.blocker_user_id = ?",
				)
				.all(userId) as Array<{ pseudonym: string }>
		).map((row) => row.pseudonym);
	}

	createReport(userId: string, roomId: string, body: unknown) {
		this.db
			.prepare("INSERT INTO reports (id, user_id, room_id, body) VALUES (?, ?, ?, ?)")
			.run(randomUUID(), userId, roomId, JSON.stringify(body));
	}

	listCatalog() {
		return (
			this.db.prepare("SELECT payload FROM catalog ORDER BY created_at").all() as Array<{
				payload: string;
			}>
		).map((row) => JSON.parse(row.payload) as CatalogRecord);
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Field-by-field fixture merging mirrors the catalog contract.
	saveCatalog(input: Partial<CatalogRecord>, id = randomUUID()) {
		const current = this.listCatalog().find((entry) => entry.id === id);
		const now = new Date().toISOString();
		const publicationStatus =
			input.publicationStatus ?? current?.publicationStatus ?? ("draft" as const);
		const record: CatalogRecord = {
			id,
			originIata: "BGY",
			operatorName: input.operatorName ?? current?.operatorName ?? null,
			serviceName: input.serviceName ?? current?.serviceName ?? null,
			destinationStopCode: input.destinationStopCode ?? current?.destinationStopCode ?? null,
			destinationStopName: input.destinationStopName ?? current?.destinationStopName ?? null,
			durationMinutes: input.durationMinutes ?? current?.durationMinutes ?? null,
			transferCount: input.transferCount ?? current?.transferCount ?? null,
			walkingMinutes: input.walkingMinutes ?? current?.walkingMinutes ?? null,
			walkingMeters: input.walkingMeters ?? current?.walkingMeters ?? null,
			sourceUrl: input.sourceUrl ?? current?.sourceUrl ?? null,
			checkedAt: input.checkedAt ?? current?.checkedAt ?? null,
			costMinorMin: input.costMinorMin ?? current?.costMinorMin ?? null,
			costMinorMax: input.costMinorMax ?? current?.costMinorMax ?? null,
			purchaseUrl: input.purchaseUrl ?? current?.purchaseUrl ?? null,
			publicationStatus,
			provenance: "operator_verified",
			freshness: publicationStatus === "published" ? "fresh" : "incomplete",
			createdAt: current?.createdAt ?? now,
			updatedAt: now,
		};
		this.db
			.prepare("INSERT OR REPLACE INTO catalog (id, payload, created_at) VALUES (?, ?, ?)")
			.run(id, JSON.stringify(record), record.createdAt);
		return record;
	}

	private publicMessage(row: MessageRow) {
		return {
			id: row.id,
			clientMessageId: row.client_message_id,
			pseudonym: row.pseudonym,
			content: row.content,
			createdAt: row.created_at,
		};
	}

	private createSchema() {
		this.db.exec(`
			CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, token TEXT UNIQUE, role TEXT, pseudonym TEXT, rules_accepted INTEGER, deleted INTEGER);
			CREATE TABLE room_members (room_id TEXT, user_id TEXT, flight_instance_id TEXT, pseudonym TEXT, selection TEXT, PRIMARY KEY (room_id, user_id));
			CREATE TABLE messages (id TEXT PRIMARY KEY, client_message_id TEXT UNIQUE, room_id TEXT, user_id TEXT, pseudonym TEXT, content TEXT, created_at TEXT);
			CREATE TABLE blocks (blocker_user_id TEXT, target_user_id TEXT, PRIMARY KEY (blocker_user_id, target_user_id));
			CREATE TABLE reports (id TEXT PRIMARY KEY, user_id TEXT, room_id TEXT, body TEXT);
			CREATE TABLE catalog (id TEXT PRIMARY KEY, payload TEXT, created_at TEXT);
		`);
	}
}
