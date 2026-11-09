import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, isApiError } from "./api";
import { env } from "./env";
import type {
  CellRef,
  FloorClaim,
  FloorCursor,
  FloorMember,
  FloorServerMessage,
  FloorTicket,
} from "./types";

export type FloorStatus = "idle" | "connecting" | "open" | "closed" | "fatal";

interface ClaimDenied {
  requestId: string;
  reason: "HELD" | "NOT_A_GROUP";
  holder?: { userId: number; displayName: string };
}

interface UseFloorOptions {
  fileId: number;
  enabled: boolean;
  onClaimGranted?: (requestId: string, claimId: string, cells: CellRef[]) => void;
  onClaimDenied?: (denied: ClaimDenied) => void;
}

interface UseFloorResult {
  status: FloorStatus;
  fatalMessage: string | null;
  members: FloorMember[];
  claims: FloorClaim[];
  cursors: FloorCursor[];
  sendCursor: (r: number, c: number) => void;
  claim: (r: number, c: number) => string;
  release: (claimId: string) => void;
  resync: () => void;
}

const DEFINITIVE_CODES = new Set([4400, 4403, 4404, 4423]);

export function useFloor({
  fileId,
  enabled,
  onClaimGranted,
  onClaimDenied,
}: UseFloorOptions): UseFloorResult {
  const [status, setStatus] = useState<FloorStatus>("idle");
  const [fatalMessage, setFatalMessage] = useState<string | null>(null);
  const [members, setMembers] = useState<FloorMember[]>([]);
  const [claims, setClaims] = useState<FloorClaim[]>([]);
  const [cursors, setCursors] = useState<FloorCursor[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const disposed = useRef(false);
  const reconnectTimer = useRef(0);
  const pingTimer = useRef(0);
  const renewTimer = useRef(0);
  const pendingPings = useRef(0);
  const backoff = useRef(1000);
  const ticketFailures = useRef(0);
  const seqRef = useRef(0);
  const claimIdRef = useRef<string | null>(null);
  const membersRef = useRef<Map<number, FloorMember>>(new Map());
  const cursorsRef = useRef<Map<number, FloorCursor>>(new Map());
  const lastCursor = useRef({ r: -1, c: -1, at: 0 });
  const grantedRef = useRef(onClaimGranted);
  const deniedRef = useRef(onClaimDenied);
  grantedRef.current = onClaimGranted;
  deniedRef.current = onClaimDenied;

  const send = useCallback((payload: Record<string, unknown>): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  const clearTimers = useCallback(() => {
    window.clearTimeout(reconnectTimer.current);
    window.clearInterval(pingTimer.current);
    window.clearInterval(renewTimer.current);
    reconnectTimer.current = 0;
    pingTimer.current = 0;
    renewTimer.current = 0;
  }, []);

  const releaseClaim = useCallback(
    (claimId: string) => {
      if (claimIdRef.current === claimId) {
        claimIdRef.current = null;
        window.clearInterval(renewTimer.current);
      }
      send({ type: "release", claimId });
    },
    [send],
  );

  useEffect(() => {
    if (!enabled || !Number.isFinite(fileId) || fileId <= 0) {
      setStatus("idle");
      return;
    }

    disposed.current = false;
    setFatalMessage(null);
    setStatus("connecting");

    const handleClose = (event: CloseEvent): void => {
      clearTimers();
      wsRef.current = null;
      claimIdRef.current = null;
      pendingPings.current = 0;
      if (disposed.current) return;

      if (DEFINITIVE_CODES.has(event.code)) {
        setStatus("fatal");
        setFatalMessage(
          event.code === 4423
            ? "El Piso de Pruebas no está abierto para este archivo."
            : event.code === 4403
              ? "Sin permiso para entrar al piso compartido."
              : event.code === 4404
                ? "El archivo no existe."
                : "El piso rechazó el mensaje enviado.",
        );
        return;
      }

      if (event.code === 4401) {
        ticketFailures.current += 1;
        if (ticketFailures.current > 2) {
          setStatus("fatal");
          setFatalMessage("No se pudo renovar el ticket del piso compartido.");
          return;
        }
      } else {
        ticketFailures.current = 0;
      }

      setStatus("closed");
      const wait = event.code === 4429 ? 10000 : backoff.current;
      backoff.current = Math.min(30000, backoff.current * 2);
      reconnectTimer.current = window.setTimeout(() => void connect(), wait);
    };

    const handleMessage = (event: MessageEvent<string>): void => {
      if (typeof event.data !== "string") return;
      let message: FloorServerMessage;
      try {
        message = JSON.parse(event.data) as FloorServerMessage;
      } catch {
        return;
      }
      if (typeof message !== "object" || message === null || typeof message.type !== "string") return;

      if ("seq" in message && typeof message.seq === "number") {
        if (message.seq <= seqRef.current) return;
        if (message.seq > seqRef.current + 1) {
          seqRef.current = message.seq;
          send({ type: "resync" });
        } else {
          seqRef.current = message.seq;
        }
      }

      switch (message.type) {
        case "snapshot": {
          seqRef.current = message.seq;
          const map = new Map<number, FloorMember>();
          for (const member of message.members) map.set(member.userId, member);
          membersRef.current = map;
          setMembers([...map.values()]);
          setClaims(message.claims);
          const currentCursors = new Map<number, FloorCursor>();
          for (const cursor of cursorsRef.current.values()) {
            if (map.has(cursor.userId)) currentCursors.set(cursor.userId, cursor);
          }
          cursorsRef.current = currentCursors;
          setCursors([...currentCursors.values()]);
          if (claimIdRef.current && !message.claims.some((claim) => claim.claimId === claimIdRef.current)) {
            claimIdRef.current = null;
            window.clearInterval(renewTimer.current);
          }
          break;
        }
        case "member.joined": {
          const map = membersRef.current;
          map.set(message.userId, { userId: message.userId, displayName: message.displayName });
          membersRef.current = map;
          setMembers([...map.values()]);
          break;
        }
        case "member.left": {
          const map = membersRef.current;
          map.delete(message.userId);
          membersRef.current = map;
          setMembers([...map.values()]);
          const cursorMap = cursorsRef.current;
          cursorMap.delete(message.userId);
          cursorsRef.current = cursorMap;
          setCursors([...cursorMap.values()]);
          setClaims((current) => current.filter((claim) => claim.userId !== message.userId));
          break;
        }
        case "cursor": {
          const cursorMap = cursorsRef.current;
          cursorMap.set(message.userId, {
            userId: message.userId,
            r: message.r,
            c: message.c,
            displayName: membersRef.current.get(message.userId)?.displayName ?? message.displayName,
          });
          cursorsRef.current = cursorMap;
          setCursors([...cursorMap.values()]);
          break;
        }
        case "claim.granted": {
          claimIdRef.current = message.claimId;
          window.clearInterval(renewTimer.current);
          renewTimer.current = window.setInterval(() => {
            send({ type: "renew", claimId: message.claimId });
          }, 10000);
          setClaims((current) => [
            ...current.filter((claim) => claim.claimId !== message.claimId),
            {
              claimId: message.claimId,
              userId: -1,
              cells: message.cells,
              expiresAt: message.expiresAt,
            },
          ]);
          grantedRef.current?.(message.requestId, message.claimId, message.cells);
          break;
        }
        case "claim.denied": {
          deniedRef.current?.({
            requestId: message.requestId,
            reason: message.reason,
            holder: message.holder,
          });
          break;
        }
        case "claim.updated": {
          setClaims((current) =>
            current.map((claim) =>
              claim.claimId === message.claimId
                ? { ...claim, cells: message.cells, expiresAt: message.expiresAt }
                : claim,
            ),
          );
          break;
        }
        case "claim.released": {
          setClaims((current) => current.filter((claim) => claim.claimId !== message.claimId));
          if (claimIdRef.current === message.claimId) {
            claimIdRef.current = null;
            window.clearInterval(renewTimer.current);
          }
          break;
        }
        case "pong":
          pendingPings.current = 0;
          break;
        default:
          break;
      }
    };

    const connect = async (): Promise<void> => {
      if (disposed.current) return;
      setStatus("connecting");
      let ticket: FloorTicket;
      try {
        ticket = await apiRequest<FloorTicket>("/floor/tickets", {
          method: "POST",
          body: { fileId },
        });
      } catch (error) {
        if (disposed.current) return;
        if (isApiError(error) && (error.status === 423 || error.status === 403 || error.status === 404)) {
          setStatus("fatal");
          setFatalMessage(
            error.status === 423
              ? "El Piso de Pruebas no está abierto."
              : error.status === 403
                ? "Sin permiso para entrar al piso compartido."
                : "El archivo no existe.",
          );
          return;
        }
        setStatus("closed");
        reconnectTimer.current = window.setTimeout(() => void connect(), backoff.current);
        backoff.current = Math.min(30000, backoff.current * 2);
        return;
      }

      if (disposed.current) return;
      const url = new URL(`${env.wsBaseUrl}/floor/ws`);
      url.searchParams.set("ticket", ticket.ticket);
      const ws = new WebSocket(url.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed.current) return;
        ticketFailures.current = 0;
        backoff.current = 1000;
        setStatus("open");
        setFatalMessage(null);
        pendingPings.current = 0;
        pingTimer.current = window.setInterval(() => {
          if (pendingPings.current >= 2) {
            ws.close(4000, "sin pong");
            return;
          }
          pendingPings.current += 1;
          send({ type: "ping", t: Date.now() });
        }, 15000);
      };

      ws.onmessage = handleMessage;
      ws.onclose = handleClose;
      ws.onerror = () => {
        /* onclose se encarga */
      };
    };

    void connect();

    return () => {
      disposed.current = true;
      clearTimers();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (claimIdRef.current) ws.send(JSON.stringify({ type: "release", claimId: claimIdRef.current }));
        ws.close(1000, "salida");
      }
      wsRef.current = null;
      claimIdRef.current = null;
      seqRef.current = 0;
      membersRef.current = new Map();
      cursorsRef.current = new Map();
    };
  }, [enabled, fileId, clearTimers, send]);

  const sendCursor = useCallback(
    (r: number, c: number) => {
      if (document.hidden) return;
      const now = Date.now();
      const previous = lastCursor.current;
      if (previous.r === r && previous.c === c) return;
      if (now - previous.at < 100) return;
      lastCursor.current = { r, c, at: now };
      send({ type: "cursor", r, c });
    },
    [send],
  );

  const claim = useCallback(
    (r: number, c: number): string => {
      const requestId = crypto.randomUUID();
      if (claimIdRef.current) {
        send({ type: "release", claimId: claimIdRef.current });
        claimIdRef.current = null;
        window.clearInterval(renewTimer.current);
      }
      send({ type: "claim", requestId, r, c });
      return requestId;
    },
    [send],
  );

  const resync = useCallback(() => {
    send({ type: "resync" });
  }, [send]);

  return {
    status,
    fatalMessage,
    members,
    claims,
    cursors,
    sendCursor,
    claim,
    release: releaseClaim,
    resync,
  };
}
