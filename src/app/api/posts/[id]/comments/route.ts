import { NextResponse } from 'next/server';
import { requireEmployee } from '@/lib/identity';
import { notifyMentions, createNotification, notifyFollowers } from '@/lib/events';
import { relationId } from '@/lib/relations';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { payload } = await requireEmployee(); const { id } = await context.params;
    const result = await payload.find({ collection: 'comments', where: { post: { equals: id } }, sort: 'createdAt', limit: 100, depth: 1, overrideAccess: true });
    return NextResponse.json(result.docs);
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { payload, user } = await requireEmployee(); const { id } = await context.params; const body = await request.json();
    if (typeof body.text !== 'string' || !body.text.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 });
    const post = await payload.findByID({ collection: 'posts', id, overrideAccess: true });
    const mentioned = Array.isArray(body.mentions) ? body.mentions.filter((v: unknown): v is string => typeof v === 'string') : [];
    const valid = mentioned.length ? await payload.find({ collection: 'users', where: { id: { in: mentioned }, active: { equals: true } }, limit: 100, overrideAccess: true }) : { docs: [] };
    const comment = await payload.create({ collection: 'comments', data: { post: id, author: user.id, body: body.text.trim().slice(0, 5000), mentions: valid.docs.map((u) => u.id) }, overrideAccess: true });
    const postAuthorId = relationId(post.author);
    if (postAuthorId !== String(user.id)) {
      await createNotification(payload, { recipient: postAuthorId, actor: String(user.id), type: 'comment', post: id, comment: String(comment.id), message: 'commented on your post', eventKey: `comment:${comment.id}` });
    }
    await notifyMentions(payload, valid.docs.map((u) => String(u.id)), String(user.id), id, String(comment.id));
    await notifyFollowers(payload, String(user.id), 'comment', id, 'commented on a post', String(comment.id));
    return NextResponse.json(comment, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 401 }); }
}
