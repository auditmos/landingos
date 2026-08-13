import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parseFlightDesignator } from "../packages/data-ops/dist/flight/index.js";
import {
	COMMUNITY_RULES_TOPICS,
	COMMUNITY_RULES_VERSION,
} from "../packages/data-ops/dist/safety/index.js";
import { authenticateFixtureRequest, handleAuthFixtureRequest } from "./e2e-auth-fixture.ts";
import { fixtureFlight, fixtureJourneyVariant } from "./e2e-fixture-data.ts";
import { FixtureStore, type FixtureUser } from "./e2e-fixture-store.ts";
import { readJsonBody as body, applyFixtureCors as cors, sendJson as json } from "./e2e-http.ts";
import {
	attachWebSocketServer,
	type TestWebSocketConnection,
	type UpgradeContext,
} from "./e2e-websocket.ts";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 8789;
const ROOM_PATH = /^\/rooms\/([0-9a-f-]+)$/;
const SELECTION_PATH = /^\/rooms\/([0-9a-f-]+)\/selection$/;
const MESSAGES_PATH = /^\/rooms\/([0-9a-f-]+)\/messages$/;
const TICKETS_PATH = /^\/rooms\/([0-9a-f-]+)\/tickets$/;
const CONNECT_PATH = /^\/rooms\/([0-9a-f-]+)\/connect$/;
const BLOCKS_PATH = /^\/safety\/rooms\/([0-9a-f-]+)\/blocks(?:\/([^/]+))?$/;
const REPORTS_PATH = /^\/safety\/rooms\/([0-9a-f-]+)\/reports$/;
const CATALOG_ITEM_PATH = /^\/operator\/catalog\/([^/]+)(?:\/(publish|unpublish))?$/;
const CLOSE_ROOM_PATH = /^\/test-control\/rooms\/([0-9a-f-]+)\/close$/;

type ConnectionRecord = {
	connection: TestWebSocketConnection;
	userId: string;
	roomId: string;
};

function authenticate(store: FixtureStore, request: IncomingMessage) {
	return authenticateFixtureRequest(store, request);
}

function requireUser(
	store: FixtureStore,
	request: IncomingMessage,
	response: ServerResponse,
): FixtureUser | undefined {
	const user = authenticate(store, request);
	if (!user) json(response, 401, { code: "UNAUTHORIZED", error: "Zaloguj się ponownie." });
	return user;
}

export async function startFixtureServer(port = DEFAULT_PORT) {
	const store = new FixtureStore();
	const connections = new Set<ConnectionRecord>();
	const upgradeUsers = new WeakMap<IncomingMessage, FixtureUser>();

	const closeUserConnections = (userId: string, code: number, reason: string) => {
		for (const record of connections) {
			if (record.userId === userId) record.connection.close(code, reason);
		}
	};
	const closeRoomConnections = (roomId: string) => {
		for (const record of connections) {
			if (record.roomId === roomId) {
				record.connection.close(4001, "Pokój tego lotu jest już zamknięty.");
			}
		}
	};
	const broadcast = (roomId: string, event: unknown) => {
		for (const record of connections) {
			if (record.roomId === roomId) record.connection.sendJson(event);
		}
	};

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The fixture is an explicit route matrix kept in one isolated HTTP boundary.
	const server = createServer(async (request, response) => {
		cors(response);
		const url = new URL(request.url ?? "/", `http://${HOST}:${port}`);
		store.recordRequest({
			method: request.method ?? "GET",
			path: url.pathname,
			authorization: Boolean(request.headers.authorization),
			cookie: Boolean(request.headers.cookie),
			upgrade: false,
		});
		if (request.method === "OPTIONS") {
			response.writeHead(204);
			response.end();
			return;
		}
		try {
			if (url.pathname === "/health") return json(response, 200, { ok: true });
			if (url.pathname === "/test-control/reset" && request.method === "POST") {
				for (const record of connections) record.connection.close();
				store.reset();
				return json(response, 200, { reset: true });
			}
			if (url.pathname === "/test-control/evidence") {
				return json(response, 200, { requests: store.requests });
			}
			const closeMatch = CLOSE_ROOM_PATH.exec(url.pathname);
			if (closeMatch && request.method === "POST") {
				closeRoomConnections(closeMatch[1] ?? "");
				return json(response, 200, { closed: true });
			}
			if (await handleAuthFixtureRequest(store, request, response, url)) return;
			if (url.pathname === "/api/profile" && request.method === "PATCH") {
				const user = requireUser(store, request, response);
				if (!user) return;
				const input = await body(request);
				if (input.action === "pseudonym") {
					store.updatePseudonym(user.id, String(input.pseudonym ?? ""));
				}
				return json(response, 200, { ok: true });
			}
			if (url.pathname === "/api/account" && request.method === "DELETE") {
				const user = requireUser(store, request, response);
				if (!user) return;
				const input = await body(request);
				if (input.confirmation !== "USUŃ KONTO") {
					return json(response, 400, { message: "Wpisz dokładnie „USUŃ KONTO”." });
				}
				store.deleteAccount(user.id);
				closeUserConnections(user.id, 4001, "Konto zostało usunięte.");
				return json(
					response,
					200,
					{ deleted: true },
					{
						"set-cookie": "landingos_e2e_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
					},
				);
			}
			if (url.pathname === "/flights/resolve" && request.method === "POST") {
				const input = await body(request);
				const parsedDesignator = parseFlightDesignator(String(input.flightNumber ?? ""));
				if (parsedDesignator.status !== "recognized") {
					return json(response, 400, {
						status: "validation_error",
						fieldErrors: { flightNumber: [parsedDesignator.message] },
					});
				}
				const flightNumber = parsedDesignator.canonical;
				if (flightNumber === "FR500" && store.nextFlightAttempt(flightNumber) === 1) {
					return json(response, 503, { error: "fixture_provider_error" });
				}
				if (flightNumber === "FR404" || flightNumber === "W61431") {
					return json(response, 200, {
						status: "manual_required",
						reason: "not_found",
						flightNumber,
						departureLocalDate: input.departureLocalDate,
					});
				}
				return json(response, 200, fixtureFlight(flightNumber));
			}
			if (url.pathname === "/flights/manual" && request.method === "POST") {
				const input = await body(request);
				const parsedDesignator = parseFlightDesignator(String(input.flightNumber ?? ""));
				if (parsedDesignator.status !== "recognized") {
					return json(response, 400, { status: "validation_error" });
				}
				const departureLocalDate = String(input.departureLocalDate ?? "");
				const scheduledArrivalUtc = String(input.scheduledArrivalUtc ?? "");
				const manual = store.completeManualFlight(
					parsedDesignator.canonical,
					departureLocalDate,
					scheduledArrivalUtc,
				);
				return json(
					response,
					200,
					fixtureFlight(parsedDesignator.canonical, {
						manual: true,
						departureLocalDate,
						scheduledArrivalUtc: manual.sharedScheduledArrivalUtc,
						id: manual.id,
						...(manual.conflict ? { manualArrivalConflict: manual.conflict } : {}),
					}),
				);
			}
			if (url.pathname === "/destinations/autocomplete" && request.method === "POST") {
				const input = await body(request);
				const query = String(input.query ?? "").toLowerCase();
				if (query.includes("błąd")) {
					return json(response, 200, {
						status: "autocomplete_unavailable",
						reason: "provider_error",
					});
				}
				const placeId = query.includes("poza")
					? "fixture:outside"
					: query.includes("bez trasy")
						? "fixture:no-route"
						: "fixture:duomo";
				return json(response, 200, {
					status: "suggestions",
					predictions: [
						{
							placeId,
							primaryText:
								placeId === "fixture:outside"
									? "Poza Mediolanem"
									: placeId === "fixture:no-route"
										? "Miejsce bez trasy"
										: "Duomo di Milano",
							secondaryText: "Mediolan, Włochy",
						},
					],
				});
			}
			if (url.pathname === "/destinations/select" && request.method === "POST") {
				const input = await body(request);
				if (input.placeId === "fixture:outside") {
					return json(response, 200, {
						status: "destination_not_supported",
						supportedAreaVersion: "milan-municipality-v1",
					});
				}
				const noRoute = input.placeId === "fixture:no-route";
				return json(response, 200, {
					status: "destination_selected",
					destination: {
						placeId: input.placeId,
						displayName: noRoute ? "Miejsce bez trasy" : "Duomo di Milano",
						coordinates: {
							latitude: noRoute ? 45.9 : 45.4642,
							longitude: noRoute ? 9.5 : 9.19,
						},
						supportedAreaVersion: "milan-municipality-v1",
					},
				});
			}
			if (url.pathname === "/journeys/recommend" && request.method === "POST") {
				const input = await body(request);
				const coordinates = input.privateDestinationCoordinates as
					| { latitude?: number }
					| undefined;
				if (coordinates?.latitude === 45.9) {
					return json(response, 200, {
						status: "no_trustworthy_route",
						reason: "zero_result",
						manualAlternatives: [
							{
								kind: "source",
								label: "Sprawdź połączenia z lotniska BGY",
								url: "https://www.milanbergamoairport.it/en/bus/",
							},
						],
					});
				}
				const published = store
					.listCatalog()
					.filter((entry) => entry.publicationStatus === "published");
				const variants = [
					...published.map((entry) =>
						fixtureJourneyVariant(entry.serviceName ?? "Transfer", entry.id),
					),
					fixtureJourneyVariant(),
				].slice(0, 3);
				return json(response, 200, { status: "recommendations", variants, explanation: null });
			}
			if (url.pathname === "/rooms/join" && request.method === "POST") {
				const user = requireUser(store, request, response);
				if (!user) return;
				if (!user.pseudonym) {
					return json(response, 409, {
						code: "PSEUDONYM_REQUIRED",
						error: "Ustaw pseudonim przed wejściem do pokoju.",
					});
				}
				const input = await body(request);
				const roomId = store.joinRoom(user, String(input.flightInstanceId ?? ""));
				return json(response, 200, store.snapshot(roomId, user));
			}
			const roomMatch = ROOM_PATH.exec(url.pathname);
			if (roomMatch && request.method === "GET") {
				const user = requireUser(store, request, response);
				if (!user) return;
				const snapshot = store.snapshot(roomMatch[1] ?? "", user);
				return snapshot
					? json(response, 200, snapshot)
					: json(response, 404, { code: "ROOM_NOT_FOUND", error: "Nie znaleziono pokoju." });
			}
			const selectionMatch = SELECTION_PATH.exec(url.pathname);
			if (selectionMatch && request.method === "PUT") {
				const user = requireUser(store, request, response);
				if (!user) return;
				const input = await body(request);
				store.updateSelection(selectionMatch[1] ?? "", user.id, input.selection);
				const member = store.member(selectionMatch[1] ?? "", user.id);
				broadcast(selectionMatch[1] ?? "", { type: "selection_changed", member });
				return json(response, 200, member);
			}
			const messagesMatch = MESSAGES_PATH.exec(url.pathname);
			if (messagesMatch && request.method === "POST") {
				const user = requireUser(store, request, response);
				if (!user) return;
				if (!user.rulesAccepted) {
					return json(response, 409, {
						code: "rules_acceptance_required",
						error: "Zaakceptuj zasady społeczności.",
					});
				}
				const input = await body(request);
				const created = store.createMessage(
					messagesMatch[1] ?? "",
					user,
					String(input.clientMessageId ?? ""),
					String(input.content ?? ""),
				);
				if (created.created) {
					broadcast(messagesMatch[1] ?? "", { type: "message_created", message: created.message });
				}
				return json(response, 200, created);
			}
			const ticketMatch = TICKETS_PATH.exec(url.pathname);
			if (ticketMatch && request.method === "POST") {
				const user = requireUser(store, request, response);
				if (!user) return;
				const ticket = `landingos-e2e-ticket-${randomUUID()}`;
				store.tickets.set(ticket, user.id);
				return json(response, 200, {
					ticket,
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
				});
			}
			if (url.pathname === "/safety/rules" && request.method === "GET") {
				const user = requireUser(store, request, response);
				if (!user) return;
				return json(response, 200, {
					version: COMMUNITY_RULES_VERSION,
					accepted: user.rulesAccepted,
					topics: COMMUNITY_RULES_TOPICS,
				});
			}
			if (url.pathname === "/safety/rules/accept" && request.method === "POST") {
				const user = requireUser(store, request, response);
				if (!user) return;
				store.acceptRules(user.id);
				return json(response, 200, {
					version: COMMUNITY_RULES_VERSION,
					acceptedAt: new Date().toISOString(),
					created: true,
				});
			}
			const blocksMatch = BLOCKS_PATH.exec(url.pathname);
			if (blocksMatch) {
				const user = requireUser(store, request, response);
				if (!user) return;
				if (request.method === "GET") {
					return json(response, 200, { blockedPseudonyms: store.blockedPseudonyms(user.id) });
				}
				if (request.method === "PUT") {
					const input = await body(request);
					const target = String(input.targetPseudonym ?? "");
					store.block(user.id, target, true);
					return json(response, 200, {
						blockedPseudonym: target,
						active: true,
						changed: true,
					});
				}
				if (request.method === "DELETE") {
					const target = decodeURIComponent(blocksMatch[2] ?? "");
					store.block(user.id, target, false);
					return json(response, 200, {
						blockedPseudonym: target,
						active: false,
						changed: true,
					});
				}
			}
			const reportsMatch = REPORTS_PATH.exec(url.pathname);
			if (reportsMatch && request.method === "POST") {
				const user = requireUser(store, request, response);
				if (!user) return;
				store.createReport(user.id, reportsMatch[1] ?? "", await body(request));
				return json(response, 201, { reportId: randomUUID(), status: "open", created: true });
			}
			if (url.pathname === "/operator/catalog" && request.method === "GET") {
				const user = requireUser(store, request, response);
				if (!user) return;
				if (user.role !== "operator") {
					return json(response, 403, { code: "FORBIDDEN", error: "Brak uprawnień operatora." });
				}
				return json(response, 200, { entries: store.listCatalog() });
			}
			if (url.pathname === "/operator/catalog" && request.method === "POST") {
				const user = requireUser(store, request, response);
				if (!user) return;
				if (user.role !== "operator") return json(response, 403, { error: "Brak uprawnień." });
				return json(response, 201, store.saveCatalog(await body(request)));
			}
			if (url.pathname === "/operator/catalog/publish" && request.method === "POST") {
				const user = requireUser(store, request, response);
				if (!user) return;
				if (user.role !== "operator") return json(response, 403, { error: "Brak uprawnień." });
				return json(
					response,
					201,
					store.saveCatalog({ ...(await body(request)), publicationStatus: "published" }),
				);
			}
			const catalogMatch = CATALOG_ITEM_PATH.exec(url.pathname);
			if (catalogMatch) {
				const user = requireUser(store, request, response);
				if (!user) return;
				if (user.role !== "operator") return json(response, 403, { error: "Brak uprawnień." });
				const id = decodeURIComponent(catalogMatch[1] ?? "");
				const current = store.listCatalog().find((entry) => entry.id === id);
				if (!current) return json(response, 404, { error: "Nie znaleziono wpisu." });
				if (catalogMatch[2] === "publish" && request.method === "POST") {
					return json(
						response,
						200,
						store.saveCatalog({ ...(await body(request)), publicationStatus: "published" }, id),
					);
				}
				if (catalogMatch[2] === "unpublish" && request.method === "POST") {
					return json(response, 200, store.saveCatalog({ publicationStatus: "draft" }, id));
				}
				if (request.method === "PATCH") {
					return json(response, 200, store.saveCatalog(await body(request), id));
				}
			}
			return json(response, 404, { error: "Nie znaleziono endpointu testowego." });
		} catch (error) {
			return json(response, 500, {
				error: error instanceof Error ? error.message : "Błąd środowiska testowego.",
			});
		}
	});

	attachWebSocketServer(
		server,
		(context) => {
			const roomMatch = CONNECT_PATH.exec(context.pathname);
			if (!roomMatch) return false;
			const authorization = context.request.headers.authorization;
			const ticket = context.searchParams.get("ticket");
			const user = authorization?.startsWith("Bearer ")
				? store.userByToken(authorization.slice("Bearer ".length))
				: ticket
					? store.userById(store.tickets.get(ticket) ?? "")
					: undefined;
			store.recordRequest({
				method: "GET",
				path: context.pathname,
				authorization: Boolean(authorization),
				cookie: Boolean(context.request.headers.cookie),
				upgrade: true,
			});
			if (!user || !store.member(roomMatch[1] ?? "", user.id)) return false;
			upgradeUsers.set(context.request, user);
			return true;
		},
		(connection, context: UpgradeContext) => {
			const roomId = CONNECT_PATH.exec(context.pathname)?.[1] ?? "";
			const user = upgradeUsers.get(context.request);
			if (!user) return connection.close(1008, "Brak autoryzacji.");
			const record = { connection, userId: user.id, roomId };
			connections.add(record);
			connection.onClose(() => connections.delete(record));
			connection.onText(() =>
				connection.sendJson({
					type: "error",
					code: "MESSAGE_TRANSPORT_NOT_SUPPORTED",
					error: "Wiadomości wysyłaj przez bezpieczny formularz pokoju.",
				}),
			);
		},
	);

	await new Promise<void>((resolve) => server.listen(port, HOST, resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Fixture server has no TCP address");
	return {
		origin: `http://${HOST}:${address.port}`,
		store,
		closeRoom: closeRoomConnections,
		close: async () => {
			for (const record of connections) record.connection.close();
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
			store.db.close();
		},
	};
}
