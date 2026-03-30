/**
 * RemoteControlClient — shared WebSocket client used by all adapters.
 *
 * Handles:
 *   - Authentication (agent token sent during registration)
 *   - Session secret capture (returned by relay on registration)
 *   - Reconnection with exponential backoff
 *   - Message routing
 */

import { WebSocket } from "ws";
import type {
  ClientEnvelope,
  E2EMode,
  EncryptedField,
  RemoteCommand,
  SessionInfo,
  TraceEvent,
} from "./index.js";
import { generateId, now } from "./index.js";
import { encrypt, decrypt, deriveKeyFromSecret } from "./crypto.js";

export interface RemoteControlClientOptions {
  agentName?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  /** Agent token for authenticating with the relay server. REQUIRED. */
  agentToken: string;
  /** Enable auto-reconnect with exponential backoff (default: false — reconnection
   *  would create a new session since the old one is gone). */
  autoReconnect?: boolean;
  /** Max reconnect attempts before giving up (default: 5) */
  maxReconnectAttempts?: number;
  /** E2E encryption mode. Default: "none". */
  e2e?: E2EMode;
  /**
   * Pre-provisioned encryption key (CryptoKey) for E2E modes.
   * - "session_secret" mode: derived automatically after registration (no need to set this)
   * - "passkey" / "passphrase" mode: must be provided by the caller
   */
  encryptionKey?: CryptoKey;
}

export class RemoteControlClient {
  private ws: WebSocket | null = null;
  private commandHandlers: Array<(cmd: RemoteCommand) => void> = [];
  private disconnectHandlers: Array<() => void> = [];
  private reconnectHandlers: Array<() => void> = [];
  private _connected = false;
  private _intentionalDisconnect = false;
  private _reconnectAttempt = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly autoReconnect: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly agentToken: string;
  private readonly e2eMode: E2EMode;
  private relayUrl: string;
  private _encryptionKey: CryptoKey | null = null;
  readonly session: SessionInfo;

  /**
   * The session secret returned by the relay after registration.
   * Share this with trusted viewers so they can subscribe to this session.
   * Only available after connect() resolves.
   */
  sessionSecret: string | null = null;

  constructor(
    relayUrl: string,
    framework: SessionInfo["agentFramework"],
    options: RemoteControlClientOptions,
  ) {
    if (!options.agentToken) {
      throw new Error("agentToken is required — set it to match the relay server's AGENT_TOKEN");
    }

    this.relayUrl = relayUrl;
    this.agentToken = options.agentToken;
    this.autoReconnect = options.autoReconnect ?? false;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.e2eMode = options.e2e ?? "none";
    this._encryptionKey = options.encryptionKey ?? null;
    this.session = {
      sessionId: options.sessionId ?? generateId(),
      agentFramework: framework,
      agentName: options.agentName,
      startedAt: now(),
      metadata: options.metadata,
      e2e: this.e2eMode !== "none" ? this.e2eMode : undefined,
    };
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    this._intentionalDisconnect = false;
    this._reconnectAttempt = 0;
    return this._connect();
  }

  private _connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.relayUrl);

      this.ws.on("open", () => {
        this._connected = true;
        this._reconnectAttempt = 0;
        // Register with the agent token for authentication
        this.ws!.send(JSON.stringify({
          kind: "register",
          session: this.session,
          token: this.agentToken,
        }));
      });

      this.ws.on("message", async (raw) => {
        try {
          const data = JSON.parse(raw.toString());

          // Capture session secret from registration response
          if (data.kind === "registered" && data.sessionSecret) {
            this.sessionSecret = data.sessionSecret;
            // In session_secret mode, auto-derive encryption key from the secret
            if (this.e2eMode === "session_secret" && !this._encryptionKey) {
              deriveKeyFromSecret(data.sessionSecret, this.session.sessionId)
                .then((key) => { this._encryptionKey = key; resolve(); })
                .catch(reject);
              return;
            }
            resolve();
            return;
          }

          // Handle registration errors
          if (data.error && !this.sessionSecret) {
            reject(new Error(`Registration failed: ${data.error}`));
            return;
          }

          // Route commands to handlers
          const envelope = data as ClientEnvelope;
          if (envelope.kind === "command") {
            let command: RemoteCommand;
            if (data.encrypted && this._encryptionKey) {
              command = await decrypt<RemoteCommand>(
                this._encryptionKey,
                data.command as EncryptedField,
                this.session.sessionId,
              );
            } else {
              command = envelope.command as RemoteCommand;
            }
            for (const handler of this.commandHandlers) {
              handler(command);
            }
          }
        } catch {
          // ignore malformed messages
        }
      });

      this.ws.on("close", () => {
        const wasConnected = this._connected;
        this._connected = false;

        if (wasConnected) {
          for (const handler of this.disconnectHandlers) handler();
        }

        if (!this._intentionalDisconnect && this.autoReconnect) {
          this._scheduleReconnect();
        }
      });

      this.ws.on("error", (err) => {
        if (!this._connected) reject(err);
      });
    });
  }

  private _scheduleReconnect(): void {
    if (this._reconnectAttempt >= this.maxReconnectAttempts) {
      console.error(
        `[remote-control] Max reconnect attempts (${this.maxReconnectAttempts}) reached, giving up`,
      );
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempt), 30_000);
    this._reconnectAttempt++;

    console.log(
      `[remote-control] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempt}/${this.maxReconnectAttempts})`,
    );

    this._reconnectTimer = setTimeout(async () => {
      try {
        await this._connect();
        for (const handler of this.reconnectHandlers) handler();
      } catch {
        // _connect failure will trigger another close → another reconnect
      }
    }, delay);
  }

  disconnect(): void {
    this._intentionalDisconnect = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this.ws?.close();
    this._connected = false;
  }

  /** Set or replace the E2E encryption key at runtime. */
  setEncryptionKey(key: CryptoKey): void {
    this._encryptionKey = key;
  }

  /** The current encryption key, if any. */
  get encryptionKey(): CryptoKey | null {
    return this._encryptionKey;
  }

  send(envelope: ClientEnvelope): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
    }
  }

  async emitTrace(event: TraceEvent): Promise<void> {
    if (this._encryptionKey && this.e2eMode !== "none") {
      const encrypted = await encrypt(this._encryptionKey, event, this.session.sessionId);
      this.send({ kind: "trace", event: encrypted as EncryptedField, encrypted: true });
    } else {
      this.send({ kind: "trace", event });
    }
  }

  onCommand(handler: (cmd: RemoteCommand) => void): void {
    this.commandHandlers.push(handler);
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler);
  }

  onReconnect(handler: () => void): void {
    this.reconnectHandlers.push(handler);
  }
}
