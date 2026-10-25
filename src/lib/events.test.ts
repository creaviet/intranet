import { describe, expect, it, vi } from 'vitest';
import { createNotification, notifyMentions } from './events';
describe('notification helpers', () => {
  it('does not notify the actor about their own action', async () => {
    const payload = { create: vi.fn(), find: vi.fn().mockResolvedValue({ docs: [] }) };
    await createNotification(payload, { recipient: 'u1', actor: 'u1', type: 'mention', post: 'p1', message: 'mentioned you', eventKey: 'e1' });
    expect(payload.create).not.toHaveBeenCalled();
  });
  it('deduplicates repeated mentioned IDs', async () => {
    const payload = { create: vi.fn().mockResolvedValue({}), find: vi.fn().mockResolvedValue({ docs: [] }) };
    await notifyMentions(payload, ['u2', 'u2', 'u3'], 'u1', 'p1');
    expect(payload.create).toHaveBeenCalledTimes(2);
  });
  it('ignores duplicate-key errors from retried events', async () => {
    const payload = { create: vi.fn().mockRejectedValue(new Error('duplicate key unique index')), find: vi.fn().mockResolvedValue({ docs: [] }) };
    await expect(createNotification(payload, { recipient: 'u2', actor: 'u1', type: 'comment', post: 'p1', message: 'commented', eventKey: 'e1' })).resolves.toBeUndefined();
  });
});
