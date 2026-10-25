import type { Payload } from 'payload';

type EventPayload = { recipient: string; actor: string; type: 'mention'|'comment'|'reaction'; post: string; comment?: string; message: string; eventKey: string };

/** Only the slice of the Payload API the notification helpers need. */
export type NotificationStore = Pick<Payload, 'create' | 'find'>;

export async function createNotification(payload: NotificationStore, event: EventPayload) {
  if (event.recipient === event.actor) return;
  try {
    await payload.create({ collection: 'notifications', data: { ...event, read: false }, overrideAccess: true });
  } catch (e) {
    // Unique eventKey prevents duplicate notifications on retried actions.
    const msg = e instanceof Error ? e.message : '';
    if (!/duplicate|unique/i.test(msg)) throw e;
  }
}

export async function notifyMentions(payload: NotificationStore, mentionedIds: string[], actorId: string, postId: string, commentId?: string) {
  for (const recipient of [...new Set(mentionedIds)]) {
    await createNotification(payload, {
      recipient, actor: actorId, type: 'mention', post: postId, comment: commentId,
      message: 'mentioned you', eventKey: `mention:${commentId || postId}:${recipient}`,
    });
  }
}

export async function notifyFollowers(payload: NotificationStore, actorId: string, type: 'post' | 'comment' | 'reaction', postId: string, message: string, commentId?: string) {
  const follows = await payload.find({ collection: 'follows', where: { followee: { equals: actorId } }, limit: 200, overrideAccess: true });
  const recipients = follows.docs.map((d: Record<string, unknown>) => {
    const f = d.follower;
    return typeof f === 'object' && f ? String((f as { id: string | number }).id) : String(f);
  });
  for (const recipient of [...new Set(recipients)]) {
    await createNotification(payload, {
      recipient, actor: actorId, type: type === 'reaction' ? 'reaction' : (type === 'comment' ? 'comment' : 'mention'),
      post: postId, comment: commentId,
      message, eventKey: `follow:${type}:${commentId || postId}:${recipient}`,
    });
  }
}
