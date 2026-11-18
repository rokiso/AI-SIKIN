import "server-only";
import { Client } from "pg";
import { getDatabaseUrl } from "@/lib/server-env";
import { getPrisma } from "@/lib/prisma";
import {
  notificationSchema,
  type DiagnosticProgress,
  type ProgressNotification,
} from "./progress-types";

const channel = "miruvia_diagnostic_progress";
type Subscription = {
  sessionId: string;
  receive: (event: ProgressNotification) => void;
  fail: () => void;
};
type Listener = { client: Client; ready: Promise<void>; subscribers: Set<Subscription> };
let listener: Listener | undefined;
function close(state: Listener) {
  if (listener === state) listener = undefined;
  void state.client
    .end()
    .catch(() => console.error("[diagnostic-progress] Listener cleanup failed"));
}
function failure(state: Listener) {
  if (listener !== state) return;
  const subscribers = [...state.subscribers];
  state.subscribers.clear();
  close(state);
  for (const subscriber of subscribers) subscriber.fail();
}

// One LISTEN connection per active process. PostgreSQL delivers across server workers;
// no memory-only queue, new table or provider calls are involved.
export async function subscribeProgress(
  sessionId: string,
  receive: Subscription["receive"],
  fail: () => void,
) {
  if (!listener) {
    const client = new Client({
      connectionString: getDatabaseUrl(),
      connectionTimeoutMillis: 2000,
      query_timeout: 2000,
    });
    const state: Listener = { client, ready: Promise.resolve(), subscribers: new Set() };
    listener = state;
    client.on("error", () => failure(state));
    client.on("end", () => failure(state));
    client.on("notification", (notification) => {
      if (notification.channel !== channel || !notification.payload) return;
      let raw: unknown;
      try {
        raw = JSON.parse(notification.payload);
      } catch {
        console.error("[diagnostic-progress] Invalid notification discarded");
        return;
      }
      const event = notificationSchema.safeParse(raw);
      if (!event.success) {
        console.error("[diagnostic-progress] Invalid event discarded");
        return;
      }
      for (const subscriber of [...state.subscribers])
        if (subscriber.sessionId === event.data.sessionId) subscriber.receive(event.data);
    });
    state.ready = client.connect().then(async () => {
      await client.query(`LISTEN ${channel}`);
    });
  }
  const state = listener;
  const subscriber: Subscription = { sessionId, receive, fail };
  state.subscribers.add(subscriber);
  try {
    await state.ready;
  } catch (error) {
    state.subscribers.delete(subscriber);
    failure(state);
    throw error;
  }
  return () => {
    state.subscribers.delete(subscriber);
    if (!state.subscribers.size && listener === state) close(state);
  };
}

export async function publishProgress(
  sessionId: string,
  progress: DiagnosticProgress,
): Promise<boolean> {
  const payload = JSON.stringify(notificationSchema.parse({ sessionId, progress }));
  try {
    await getPrisma().$queryRaw`SELECT pg_notify(${channel}, ${payload})::text`;
    return true;
  } catch {
    // Progress delivery is optional to report creation. The observing stream has
    // its own database recovery check and exposes transport errors to the user.
    console.error("[diagnostic-progress] Event delivery failed; report status must be rechecked");
    return false;
  }
}
