import { NextResponse } from 'next/server';
import { requireEmployee } from '@/lib/identity';
import { createNotification, notifyFollowers } from '@/lib/events';
import { relationId } from '@/lib/relations';
const allowed = new Set(['👍', '❤️', '🎉', '🙌']);
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { payload } = await requireEmployee();
    const { id } = await context.params;
    const reactions = await payload.find({ collection: 'reactions', where: { post: { equals: id } }, limit: 200, depth: 1, overrideAccess: true });
    const items = reactions.docs.map((r: Record<string, unknown>) => {
      const user = r.user && typeof r.user === 'object' ? (r.user as { id?: string; name?: string | null }) : null;
      return { emoji: r.emoji, user: user ? { id: String(user.id), name: user.name ?? null } : null };
    });
    return NextResponse.json(items);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 401 }); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { payload, user } = await requireEmployee(); const { id } = await context.params; const body = await request.json();
    if (typeof body.emoji !== 'string' || !allowed.has(body.emoji)) return NextResponse.json({ error: 'Unsupported reaction' }, { status: 400 });
    const post = await payload.findByID({ collection: 'posts', id, overrideAccess: true });
    const existing = await payload.find({ collection: 'reactions', where: { and: [{ post: { equals: id } }, { user: { equals: user.id } }] }, limit: 1, overrideAccess: true });
    if (existing.docs[0]) {
      const previousEmoji = (existing.docs[0] as { emoji?: string }).emoji;
      if (previousEmoji === body.emoji) await payload.delete({ collection: 'reactions', id: existing.docs[0].id, overrideAccess: true });
      else { await payload.delete({ collection: 'reactions', id: existing.docs[0].id, overrideAccess: true }); await payload.create({ collection: 'reactions', data: { post: id, user: user.id, emoji: body.emoji }, overrideAccess: true }); }
    } else {
      const reaction = await payload.create({ collection: 'reactions', data: { post: id, user: user.id, emoji: body.emoji }, overrideAccess: true });
      const authorId = relationId(post.author);
      await createNotification(payload, { recipient: authorId, actor: String(user.id), type: 'reaction', post: id, message: `reacted ${body.emoji} to your post`, eventKey: `reaction:${reaction.id}` });
      await notifyFollowers(payload, String(user.id), 'reaction', id, `reacted ${body.emoji} to a post`);
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 401 }); }
}
