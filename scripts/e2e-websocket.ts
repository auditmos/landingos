import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { connect, type Socket } from "node:net";

const WEB_SOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function frame(opcode: number, payload: Buffer, masked = false): Buffer {
	const maskLength = masked ? 4 : 0;
	const lengthBytes = payload.length < 126 ? 0 : payload.length <= 0xffff ? 2 : 8;
	const header = Buffer.alloc(2 + lengthBytes + maskLength);
	header[0] = 0x80 | opcode;
	header[1] =
		(masked ? 0x80 : 0) | (lengthBytes === 0 ? payload.length : lengthBytes === 2 ? 126 : 127);
	if (lengthBytes === 2) header.writeUInt16BE(payload.length, 2);
	if (lengthBytes === 8) header.writeBigUInt64BE(BigInt(payload.length), 2);
	if (!masked) return Buffer.concat([header, payload]);
	const maskOffset = 2 + lengthBytes;
	const mask = randomBytes(4);
	mask.copy(header, maskOffset);
	const encoded = Buffer.alloc(payload.length);
	for (let index = 0; index < payload.length; index += 1) {
		encoded[index] = (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
	}
	return Buffer.concat([header, encoded]);
}

type ParsedFrame = { opcode: number; payload: Buffer; consumed: number };

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: RFC 6455 frame-length and mask branches are intentionally colocated.
function parseFrame(buffer: Buffer): ParsedFrame | undefined {
	if (buffer.length < 2) return;
	const masked = Boolean((buffer[1] ?? 0) & 0x80);
	let length = (buffer[1] ?? 0) & 0x7f;
	let offset = 2;
	if (length === 126) {
		if (buffer.length < 4) return;
		length = buffer.readUInt16BE(2);
		offset = 4;
	} else if (length === 127) {
		if (buffer.length < 10) return;
		const largeLength = buffer.readBigUInt64BE(2);
		if (largeLength > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("WebSocket frame too large");
		length = Number(largeLength);
		offset = 10;
	}
	const mask = masked ? buffer.subarray(offset, offset + 4) : undefined;
	if (masked) offset += 4;
	if (buffer.length < offset + length) return;
	const payload = Buffer.from(buffer.subarray(offset, offset + length));
	if (mask) {
		for (let index = 0; index < payload.length; index += 1) {
			payload[index] = (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
		}
	}
	return { opcode: (buffer[0] ?? 0) & 0x0f, payload, consumed: offset + length };
}

export class TestWebSocketConnection {
	private buffer = Buffer.alloc(0);
	private closed = false;
	private readonly textHandlers = new Set<(value: string) => void>();
	private readonly closeHandlers = new Set<() => void>();

	constructor(readonly socket: Socket) {
		socket.on("data", (chunk) => {
			this.buffer = Buffer.concat([this.buffer, chunk]);
			this.consume();
		});
		socket.on("close", () => this.finish());
		socket.on("error", () => this.finish());
	}

	onText(handler: (value: string) => void) {
		this.textHandlers.add(handler);
	}

	onClose(handler: () => void) {
		this.closeHandlers.add(handler);
	}

	sendJson(value: unknown) {
		if (!this.closed) this.socket.write(frame(1, Buffer.from(JSON.stringify(value))));
	}

	close(code = 1000, reason = "") {
		if (this.closed) return;
		const reasonBytes = Buffer.from(reason).subarray(0, 123);
		const payload = Buffer.alloc(2 + reasonBytes.length);
		payload.writeUInt16BE(code, 0);
		reasonBytes.copy(payload, 2);
		this.socket.end(frame(8, payload), () => this.socket.destroy());
		this.finish();
	}

	private consume() {
		let parsed = parseFrame(this.buffer);
		while (parsed) {
			this.buffer = this.buffer.subarray(parsed.consumed);
			if (parsed.opcode === 1) {
				for (const handler of this.textHandlers) handler(parsed.payload.toString("utf8"));
			} else if (parsed.opcode === 8) {
				this.close();
			} else if (parsed.opcode === 9) {
				this.socket.write(frame(10, parsed.payload));
			}
			parsed = parseFrame(this.buffer);
		}
	}

	private finish() {
		if (this.closed) return;
		this.closed = true;
		for (const handler of this.closeHandlers) handler();
	}
}

export type UpgradeContext = {
	request: IncomingMessage;
	pathname: string;
	searchParams: URLSearchParams;
};

export function attachWebSocketServer(
	server: Server,
	authorize: (context: UpgradeContext) => boolean,
	onConnection: (connection: TestWebSocketConnection, context: UpgradeContext) => void,
) {
	server.on("upgrade", (request, socket) => {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		const context = { request, pathname: url.pathname, searchParams: url.searchParams };
		const key = request.headers["sec-websocket-key"];
		if (!key || !authorize(context)) {
			socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
			return;
		}
		const accept = createHash("sha1").update(`${key}${WEB_SOCKET_GUID}`).digest("base64");
		socket.write(
			[
				"HTTP/1.1 101 Switching Protocols",
				"Upgrade: websocket",
				"Connection: Upgrade",
				`Sec-WebSocket-Accept: ${accept}`,
				"\r\n",
			].join("\r\n"),
		);
		onConnection(new TestWebSocketConnection(socket), context);
	});
}

export class RawWebSocketClient {
	private buffer = Buffer.alloc(0);
	private readonly messages: string[] = [];
	private readonly waiters: Array<(value: string) => void> = [];

	private constructor(private readonly socket: Socket) {
		socket.on("data", (chunk) => {
			this.buffer = Buffer.concat([this.buffer, chunk]);
			this.consume();
		});
	}

	static async connect(url: URL, authorization: string): Promise<RawWebSocketClient> {
		const key = randomBytes(16).toString("base64");
		const socket = connect(Number(url.port), url.hostname);
		await new Promise<void>((resolve, reject) => {
			socket.once("connect", resolve);
			socket.once("error", reject);
		});
		socket.write(
			[
				`GET ${url.pathname}${url.search} HTTP/1.1`,
				`Host: ${url.host}`,
				"Upgrade: websocket",
				"Connection: Upgrade",
				`Sec-WebSocket-Key: ${key}`,
				"Sec-WebSocket-Version: 13",
				`Authorization: ${authorization}`,
				"\r\n",
			].join("\r\n"),
		);
		let handshake = Buffer.alloc(0);
		let trailing = Buffer.alloc(0);
		await new Promise<void>((resolve, reject) => {
			const onData = (chunk: Buffer) => {
				handshake = Buffer.concat([handshake, chunk]);
				const end = handshake.indexOf("\r\n\r\n");
				if (end < 0) return;
				socket.off("data", onData);
				const header = handshake.subarray(0, end).toString("utf8");
				if (!header.startsWith("HTTP/1.1 101")) {
					reject(new Error(`WebSocket handshake failed: ${header.split("\r\n")[0]}`));
					return;
				}
				trailing = handshake.subarray(end + 4);
				resolve();
			};
			socket.on("data", onData);
			socket.once("error", reject);
		});
		const client = new RawWebSocketClient(socket);
		client.buffer = trailing;
		client.consume();
		return client;
	}

	sendText(value: string) {
		this.socket.write(frame(1, Buffer.from(value), true));
	}

	nextText(timeoutMs: number): Promise<string> {
		const existing = this.messages.shift();
		if (existing !== undefined) return Promise.resolve(existing);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error("Timed out waiting for WebSocket text")),
				timeoutMs,
			);
			this.waiters.push((value) => {
				clearTimeout(timer);
				resolve(value);
			});
		});
	}

	close() {
		this.socket.end(frame(8, Buffer.from([0x03, 0xe8]), true));
	}

	private consume() {
		let parsed = parseFrame(this.buffer);
		while (parsed) {
			this.buffer = this.buffer.subarray(parsed.consumed);
			if (parsed.opcode === 1) {
				const value = parsed.payload.toString("utf8");
				const waiter = this.waiters.shift();
				if (waiter) waiter(value);
				else this.messages.push(value);
			}
			parsed = parseFrame(this.buffer);
		}
	}
}
