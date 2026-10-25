import { NextResponse } from 'next/server';
import { requireEmployee } from '@/lib/identity';
import { notifyMentions, notifyFollowers } from '@/lib/events';

export async function GET() {
  try {
    const { payload } = await requireEmployee();
    const posts = await payload.find({ collection: 'posts', sort: '-createdAt', limit: 30, depth: 1, overrideAccess: true });
    return NextResponse.json(posts.docs);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { payload, user } = await requireEmployee();
    const body = await request.json();
    if (typeof body.title !== 'string' || !body.title.trim() || typeof body.text !== 'string' || !body.text.trim()) {
      return NextResponse.json({ error: 'title and text are required' }, { status: 400 });
    }
    const mentioned = Array.isArray(body.mentions) ? body.mentions.filter((v: unknown): v is string => typeof v === 'string') : [];
    const valid = mentioned.length ? await payload.find({ collection: 'users', where: { id: { in: mentioned }, active: { equals: true } }, limit: 100, overrideAccess: true }) : { docs: [] };
    const post = await payload.create({
      collection: 'posts',
      data: { title: body.title.trim().slice(0, 200), body: { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text: body.text.slice(0, 10000), detail: 0, format: 0, mode: 'normal', style: '' }], direction: 'ltr', format: '', indent: 0 }] } }, author: user.id, mentions: valid.docs.map((u) => u.id) },
      overrideAccess: true,
    });
    await notifyMentions(payload, valid.docs.map((u) => String(u.id)), String(user.id), String(post.id));
    await notifyFollowers(payload, String(user.id), 'post', String(post.id), 'posted an update');
    return NextResponse.json(post, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 401 });
  }
}
