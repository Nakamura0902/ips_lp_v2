import { Redis } from '@upstash/redis';
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const DEMO = {
  pvTotal: 1284, uvTotal: 892, avgDur: 187,
  src: { 'Instagram': 354, 'ダイレクト': 287, 'Google': 198, 'LINE': 143, 'X (Twitter)': 89, 'その他': 63 },
  dev: { 'mobile': 712, 'desktop': 143, 'tablet': 37 },
  scrollDist: { 10:892,20:754,30:621,40:498,50:389,60:298,70:221,80:167,90:124,100:83 },
  trend: Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 29 + i);
    const base = 30 + Math.round(Math.sin(i * 0.4) * 12 + Math.random() * 15);
    return { date: d.toISOString().slice(0, 10), pv: base + Math.round(Math.random()*10), uv: Math.round(base * 0.72) };
  }),
  isDemo: true,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  // KV未設定時はデモデータ
  if (!process.env.KV_REST_API_URL) {
    return res.status(200).json(DEMO);
  }

  try {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 29 + i);
      return d.toISOString().slice(0, 10);
    });

    const [pvTotal, uvTotal, src, dev, durTotal, durCount] = await Promise.all([
      kv.get('pv:total'),
      kv.get('uv:total'),
      kv.hgetall('src'),
      kv.hgetall('dev'),
      kv.get('dur:total'),
      kv.get('dur:count'),
    ]);

    const dayPairs = await Promise.all(
      days.map(d => Promise.all([kv.get(`pv:${d}`), kv.get(`uv:${d}`)]))
    );

    const scrollKeys = [10,20,30,40,50,60,70,80,90,100];
    const scrollVals = await Promise.all(scrollKeys.map(k => kv.get(`scroll:${k}`)));
    const scrollDist = {};
    scrollKeys.forEach((k, i) => { scrollDist[k] = Number(scrollVals[i] || 0); });

    res.status(200).json({
      pvTotal: Number(pvTotal || 0),
      uvTotal: Number(uvTotal || 0),
      avgDur: durCount ? Math.round(Number(durTotal) / Number(durCount)) : 0,
      src: src || {},
      dev: dev || {},
      scrollDist,
      trend: days.map((d, i) => ({ date: d, pv: Number(dayPairs[i][0]||0), uv: Number(dayPairs[i][1]||0) })),
    });
  } catch (e) {
    console.error('[data]', e.message);
    res.status(500).json({ error: e.message });
  }
}
