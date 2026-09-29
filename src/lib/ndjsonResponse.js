// A streamed response of newline-delimited JSON events. `run(send)` produces
// the events; an exception becomes a final { t: "error", message } event.
// If the reader disconnects, run keeps going (sends become no-ops) so work
// like saving a finished article still completes.
export function ndjsonResponse(run) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // reader went away
        }
      };

      try {
        await run(send);
      } catch (err) {
        console.error("[ndjsonResponse] stream failed:", err);
        send({ t: "error", message: err.message || "Something went wrong" });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
