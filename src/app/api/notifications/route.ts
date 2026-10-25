import { NextResponse } from 'next/server';
import { requireEmployee } from '@/lib/identity';
import { relationId } from '@/lib/relations';
export async function GET() {
  try {
    const { payload, user } = await requireEmployee();
    const result = await payload.find({ collection: 'notifications', where: { recipient: { equals: user.id } }, sort: '-createdAt', limit: 50, overrideAccess: true });
    return NextResponse.json(result.docs);
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
}
export async function PATCH(request: Request) {
  try {
    const { payload, user } = await requireEmployee(); const body = await request.json();
    if (typeof body.id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 });
    const found = await payload.findByID({ collection: 'notifications', id: body.id, overrideAccess: true });
    const recipient = relationId(found.recipient);
    if (recipient !== String(user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await payload.update({ collection: 'notifications', id: body.id, data: { read: Boolean(body.read ?? true) }, overrideAccess: true });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
}
