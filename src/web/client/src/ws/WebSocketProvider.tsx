import { useEffect, useRef } from "react";
import { useWsStore } from "./store";

const INITIAL_RECONNECT_MS = 1500;
const MAX_RECONNECT_MS = 15000;

function getWsUrl(): string {
  const env = import.meta.env.VITE_WS_URL;
  if (env && typeof env === "string") return env.trim();
  const { hostname } = typeof location !== "undefined" ? location : { hostname: "localhost" };
  return `ws://${hostname}:8000/ws`;
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  const setConnectionStatus = useWsStore((s) => s.setConnectionStatus);
  const setFromNodeEvent = useWsStore((s) => s.setFromNodeEvent);
  const setConfig = useWsStore((s) => s.setConfig);
  const setLastError = useWsStore((s) => s.setLastError);
  const setSendMessage = useWsStore((s) => s.setSendMessage);
  const pushAlert = useWsStore((s) => s.pushAlert);
  const setPendingApproval = useWsStore((s) => s.setPendingApproval);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;
      const url = getWsUrl();
      setConnectionStatus("connecting");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        reconnectAttemptRef.current = 0;
        setConnectionStatus("open");
        setLastError(null);
        setSendMessage((payload) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(payload));
          }
        });
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          const type = payload.type as string | undefined;
          if (type === "node_event" && payload.state && typeof payload.state === "object") {
            const state = payload.state as Record<string, unknown>;
            setFromNodeEvent({
              task_queue: state.task_queue as Record<string, unknown>[] | undefined,
              bot_stats: state.bot_stats as Record<string, Record<string, unknown>> | undefined,
              cycle: state.cycle as number | undefined,
            });
          } else if (type === "init" && payload.config) {
            setConfig(payload.config as Record<string, unknown>);
          } else if (type === "config_updated" && payload.config) {
            setConfig(payload.config as Record<string, unknown>);
          } else if (type === "error" && typeof payload.message === "string") {
            setLastError(payload.message);
          } else if (type === "task_queue_updated" && payload.task_queue) {
            setFromNodeEvent({
              task_queue: payload.task_queue as Record<string, unknown>[],
            });
          } else if (type === "timeout_alert") {
            const taskId = payload.task_id as string | undefined;
            if (payload.task_queue) {
              setFromNodeEvent({
                task_queue: payload.task_queue as Record<string, unknown>[],
              });
            }
            if (taskId) {
              setLastError(`Task ${taskId} exceeded its timebox.`);
            }
          } else if (type === "approval_request" && payload.pending) {
            const pending = payload.pending as Record<string, unknown>;
            setPendingApproval(pending);
            pushAlert({
              id: `approval-${Date.now()}`,
              type: "approval_request",
              message: "Approval required for a task.",
              details: pending,
              created_at: new Date().toISOString(),
            });
          } else if (type === "hallucination_warning") {
            pushAlert({
              id: `hallucination-${Date.now()}`,
              type: "hallucination_warning",
              message:
                (payload.message as string) ||
                "Potential hallucination detected in model output.",
              details: payload as Record<string, unknown>,
              created_at: new Date().toISOString(),
            });
          } else if (type === "system_error") {
            const msg = (payload.message as string) || "A system error occurred.";
            setLastError(msg);
            pushAlert({
              id: `system-${Date.now()}`,
              type: "system_error",
              message: msg,
              details: payload as Record<string, unknown>,
              created_at: new Date().toISOString(),
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setSendMessage(() => {});
        wsRef.current = null;
        if (!mountedRef.current) return;
        setConnectionStatus("closed");
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(
          INITIAL_RECONNECT_MS * Math.pow(1.5, attempt),
          MAX_RECONNECT_MS
        );
        reconnectAttemptRef.current = attempt + 1;
        setConnectionStatus("reconnecting");
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          if (mountedRef.current) connect();
        }, delay);
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setConnectionStatus("error");
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [setConnectionStatus, setFromNodeEvent, setConfig, setLastError, setSendMessage]);

  return <>{children}</>;
}
