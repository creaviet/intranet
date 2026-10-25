import { requireEmployee } from '@/lib/identity';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const { payload, user } = await requireEmployee();
    const encoder = new TextEncoder();
    let closed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => { if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
        send('connected', { ok: true });
        let lastSeen = new Date().toISOString();
        timer = setInterval(async () => {
          try {
            const result = await payload.find({ collection: 'notifications', where: { and: [{ recipient: { equals: user.id } }, { createdAt: { greater_than: lastSeen } }] }, sort: 'createdAt', limit: 50, overrideAccess: true });
            if (result.docs.length) { lastSeen = String(result.docs[result.docs.length - 1].createdAt || new Date().toISOString()); send('notifications', result.docs); }
            else send('ping', { at: new Date().toISOString() });
          } catch { send('error', { message: 'notification polling failed' }); }
        }, 3000);
      },
      cancel() { closed = true; if (timer) clearInterval(timer); },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
  } catch { return new Response('Unauthorized', { status: 401 }); }
}
