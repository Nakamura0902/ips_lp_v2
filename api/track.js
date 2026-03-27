import { kv } from '@vercel/kv';

function refSource(ref) {
  if (!ref) return 'ダイレクト';
  if (/google/i.test(ref))                   return 'Google';
  if (/yahoo/i.test(ref))                    return 'Yahoo!';
  if (/instagram/i.test(ref))                return 'Instagram';
  if (/facebook|fb\.com/i.test(ref))         return 'Facebook';
  if (/twitter|t\.co|x\.com/i.test(ref))     return 'X (Twitter)';
  if (/line/i.test(ref))                     return 'LINE';
  if (/tiktok/i.test(ref))                   return 'TikTok';
  return 'その他';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).end(); }
  }

  const { type, data } = body || {};
  const today = new Date().toISOString().slice(0, 10);

  try {
    if (type === 'pageview') {
      const { sid, ref, dev } = data;
      const isNew = !(await kv.exists(`s:${sid}`));

      await kv.incr('pv:total');
      await kv.incr(`pv:${today}`);
      if (isNew) {
        await kv.incr('uv:total');
        await kv.incr(`uv:${today}`);
      }

      const src = refSource(ref || '');
      await kv.hincrby('src', src, 1);
      await kv.hincrby('dev', dev || 'desktop', 1);

      if (isNew) {
        await kv.hset(`s:${sid}`, { start: Date.now(), src, dev, maxS: 0, date: today });
        await kv.expire(`s:${sid}`, 86400 * 30);
        await kv.lpush('sess:list', sid);
        await kv.ltrim('sess:list', 0, 999);
      }
    }

    if (type === 'scroll') {
      const { sid, depth } = data;
      const cur = Number(await kv.hget(`s:${sid}`, 'maxS') || 0);
      if (depth > cur) {
        await kv.hset(`s:${sid}`, { maxS: depth });
        for (let m = Math.ceil(cur / 10) * 10 + 10; m <= depth; m += 10) {
          if (m % 10 === 0) await kv.incr(`scroll:${m}`);
        }
      }
    }

    if (type === 'leave') {
      const { sid, sec, maxS } = data;
      await kv.hset(`s:${sid}`, { dur: sec, maxS });
      await kv.incrby('dur:total', Math.min(sec, 3600));
      await kv.incr('dur:count');
    }

    res.status(200).json({ ok: 1 });
  } catch (e) {
    console.error('[track]', e.message);
    res.status(500).json({ error: e.message });
  }
}
