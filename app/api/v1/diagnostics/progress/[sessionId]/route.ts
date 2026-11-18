import { cookies } from "next/headers";
import { z } from "zod";
import { AuthError } from "@/lib/auth/response";
import { readSessionCookies } from "@/lib/session/identity";
import { reportFailure } from "@/lib/diagnostic/report-http";
import { readProgressState, terminalEvent } from "@/lib/diagnostic/progress-state";
import { subscribeProgress } from "@/lib/diagnostic/progressEmitter";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    if (!z.uuid().safeParse(sessionId).success)
      throw new AuthError(400, "INVALID_SESSION_ID", "문진 세션 주소를 확인해 주세요.");
    const values = readSessionCookies(await cookies());
    await readProgressState(values, sessionId);
    const encoder = new TextEncoder();
    let stopped = false;
    let started = false;
    const earlyProgress: unknown[] = [];
    let earlyFailure = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let queue = Promise.resolve();
    function stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(poll);
      clearTimeout(deadline);
      release?.();
      request.signal.removeEventListener("abort", stop);
      controller.close();
    }
    function send(event: string, data: unknown) {
      if (!stopped)
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    }
    function fail(error?: unknown) {
      if (stopped) return;
      const code = error instanceof AuthError ? error.code : "PROGRESS_UNAVAILABLE";
      if (!(error instanceof AuthError)) console.error("[diagnostic-progress] Stream unavailable");
      send("error", {
        code,
        message:
          "분석 진행 상태를 실시간으로 불러오지 못했습니다. 리포트 생성 상태를 다시 확인해 주세요.",
      });
      stop();
    }
    function check(progress?: unknown) {
      queue = queue
        .then(async () => {
          if (stopped) return;
          const state = await readProgressState(values, sessionId);
          if (stopped) return;
          if (progress) send("progress", progress);
          const terminal = terminalEvent(state);
          if (
            terminal &&
            (!progress ||
              (typeof progress === "object" &&
                "stepNumber" in progress &&
                progress.stepNumber === 3))
          ) {
            send(terminal.event, terminal.data);
            stop();
          } else if (state.status === "FAILED")
            fail(new AuthError(503, "ANALYSIS_FAILED", "분석을 다시 시도해 주세요."));
          else if (!progress) controller.enqueue(encoder.encode(": keep-alive\n\n"));
        })
        .catch(fail);
    }
    // LISTEN is ready before EventSource opens, so a newly initiated POST cannot
    // outrun registration. A database check also recovers missed terminal events.
    const release = await subscribeProgress(
      sessionId,
      (event) => {
        if (started) check(event.progress);
        else earlyProgress.push(event.progress);
      },
      () => {
        if (started) fail();
        else earlyFailure = true;
      },
    );
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
        started = true;
        controller.enqueue(encoder.encode(": connected\n\n"));
        request.signal.addEventListener("abort", stop, { once: true });
        if (request.signal.aborted) {
          stop();
          return;
        }
        if (earlyFailure) {
          fail();
          return;
        }
        for (const progress of earlyProgress) check(progress);
        check();
        poll = setInterval(() => check(), 500);
        deadline = setTimeout(() => {
          send("error", {
            code: "ANALYSIS_STILL_PENDING",
            message: "리포트 준비가 끝나지 않았습니다. 생성 상태를 다시 확인해 주세요.",
          });
          stop();
        }, 12000);
      },
      cancel() {
        // A cancelled reader is already closed; only dispose resources here.
        if (stopped) return;
        stopped = true;
        clearInterval(poll);
        clearTimeout(deadline);
        release?.();
        request.signal.removeEventListener("abort", stop);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-cache, no-store, no-transform",
        Vary: "Cookie",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return reportFailure(error);
  }
}
