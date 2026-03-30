import { useState } from "react";

interface Props {
  relayHttpUrl: string;
  sessionSecret: string;
  onSelect: (sessionId: string) => void;
}

/**
 * With per-session authentication, viewers can't browse all sessions.
 * The agent operator shares a session ID + secret with trusted viewers.
 * This screen lets the viewer enter the session ID to connect.
 */
export function SessionList({ relayHttpUrl, sessionSecret: _sessionSecret, onSelect }: Props) {
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const handleConnect = async () => {
    const trimmed = sessionId.trim();
    if (!trimmed) return;

    // Basic validation: alphanumeric, dashes, underscores
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(trimmed)) {
      setError("Invalid session ID format");
      return;
    }

    setTesting(true);
    setError(null);

    // Just connect directly — the WebSocket subscribe will validate the secret
    onSelect(trimmed);
    setTesting(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.card}>
          <h2 style={styles.heading}>Connect to Session</h2>
          <p style={styles.subtitle}>
            Enter the session ID provided by the agent operator.
          </p>

          <div style={styles.field}>
            <label style={styles.label}>Session ID</label>
            <input
              style={styles.input}
              placeholder="Paste session ID from the agent"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && sessionId.trim()) {
                  handleConnect();
                }
              }}
              autoFocus
            />
            <p style={styles.hint}>
              The agent logs the session ID alongside the session secret when it
              connects to the relay.
            </p>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button
            style={{
              ...styles.connectButton,
              opacity: testing || !sessionId.trim() ? 0.6 : 1,
            }}
            onClick={handleConnect}
            disabled={testing || !sessionId.trim()}
          >
            {testing ? "Connecting..." : "Connect to Session"}
          </button>

          <div style={styles.infoBox}>
            <p style={styles.infoText}>
              The relay URL and session secret were provided on the previous
              screen. The session ID identifies which agent session to connect to.
            </p>
          </div>
        </div>

        <div style={styles.relayInfo}>
          <span style={styles.relayLabel}>Relay:</span>
          <span style={styles.relayUrl}>{relayHttpUrl}</span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    overflow: "auto",
    padding: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    maxWidth: "480px",
    width: "100%",
  },
  card: {
    background: "#111",
    border: "1px solid #222",
    borderRadius: "16px",
    padding: "32px",
  },
  heading: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#fff",
    marginBottom: "8px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#666",
    marginBottom: "24px",
    lineHeight: 1.5,
  },
  field: {
    marginBottom: "16px",
  },
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: "6px",
  },
  input: {
    width: "100%",
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#e5e5e5",
    fontSize: "14px",
    fontFamily: "monospace",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  hint: {
    fontSize: "12px",
    color: "#555",
    marginTop: "6px",
    lineHeight: 1.4,
  },
  error: {
    fontSize: "13px",
    color: "#ef4444",
    marginBottom: "12px",
  },
  connectButton: {
    width: "100%",
    background: "#2563eb",
    border: "none",
    color: "#fff",
    padding: "12px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: 600,
  },
  infoBox: {
    marginTop: "20px",
    padding: "12px",
    background: "#0a0a0a",
    borderRadius: "8px",
    border: "1px solid #1a1a1a",
  },
  infoText: {
    fontSize: "12px",
    color: "#555",
    lineHeight: 1.5,
    margin: 0,
  },
  relayInfo: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    justifyContent: "center",
    marginTop: "16px",
  },
  relayLabel: {
    fontSize: "11px",
    color: "#555",
  },
  relayUrl: {
    fontSize: "11px",
    color: "#444",
    fontFamily: "monospace",
  },
};
