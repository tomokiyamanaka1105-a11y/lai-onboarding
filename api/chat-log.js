// api/chat-log.js
// チャットログの保存・取得

import { createClient } from 'redis';

function getClient() {
  return createClient({ url: process.env.REDIS_URL });
}

function getKey(clientId, accountId) {
  return `chatlog:${clientId}:${accountId}`;
}

export default async function handler(req, res) {
  const { method } = req;
  const { clientId, accountId } = method === 'GET' ? req.query : req.body;

  if (!clientId || !accountId) {
    return res.status(400).json({ error: 'clientId, accountId が必要です' });
  }

  const redis = getClient();
  try {
    await redis.connect();
    const key = getKey(clientId, accountId);

    if (method === 'GET') {
      // ログ取得
      const data = await redis.get(key);
      const messages = data ? JSON.parse(data) : [];
      return res.status(200).json({ messages });

    } else if (method === 'POST') {
      // ログ保存（直近50件）
      const { messages } = req.body;
      if (!Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages は配列が必要です' });
      }
      const trimmed = messages.slice(-50); // 最新50件のみ保持
      await redis.set(key, JSON.stringify(trimmed), { EX: 60 * 60 * 24 * 90 }); // 90日保持
      return res.status(200).json({ success: true, count: trimmed.length });

    } else if (method === 'DELETE') {
      // ログ削除
      await redis.del(key);
      return res.status(200).json({ success: true });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    await redis.disconnect();
  }
}
