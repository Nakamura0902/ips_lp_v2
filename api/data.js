import { Redis } from '@upstash/redis';
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

// デモデータ（KV未設定時）
function demoData() {
  const trend = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 29 + i);
    const base = 28 + Math.round(Math.sin(i * 0.45) * 10 + Math.random() * 12);
    return { date: d.toISOString().slice(0, 10), pv: base + Math.round(Math.random() * 8), uv: Math.round(base * 0.72) };
  });
  return {
    pvTotal: 1284, uvTotal: 892, avgDur: 187, bounceCount: 312, bounceRate: 35,
    ctaTotal: 156, ctaRate: 17.5,
    faqTotal: 203, faqRate: 22.8,
    src: { 'Instagram': 354, 'ダイレクト': 287, 'Google': 198, 'LINE': 143, 'X (Twitter)': 89, 'その他': 63 },
    dev: { 'mobile': 712, 'desktop': 143, 'tablet': 37 },
    ctaLabels: { '今すぐ購入 →': 89, '購入する': 45, '今すぐ購入': 22 },
    scrollDist: { 10:892,20:754,30:621,40:498,50:389,60:298,70:221,80:167,90:124,100:83 },
    sections: { hero:892, pain:741, cause:603, product:489, tech:367, howto:289, trust:198, anchor:154, cta:109 },
    trend, isDemo: true,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (!process.env.KV_REST_API_URL) return res.status(200).json(demoData());

  try {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 29 + i);
      return d.toISOString().slice(0, 10);
    });

    const [
      pvTotal, uvTotal, src, dev,
      durTotal, durCount, bounceCount,
      ctaTotal, ctaLabels, faqTotal, sections,
    ] = await Promise.all([
      kv.get('pv:total'),  kv.get('uv:total'),
      kv.hgetall('src'),   kv.hgetall('dev'),
      kv.get('dur:total'), kv.get('dur:count'), kv.get('bounce:count'),
      kv.get('cta:total'), kv.hgetall('cta:labels'),
      kv.get('faq:total'), kv.hgetall('sections'),
    ]);

    const dayPairs = await Promise.all(days.map(d =>
      Promise.all([kv.get(`pv:${d}`), kv.get(`uv:${d}`)])
    ));

    const scrollKeys = [10,20,30,40,50,60,70,80,90,100];
    const scrollVals = await Promise.all(scrollKeys.map(k => kv.get(`scroll:${k}`)));
    const scrollDist = {};
    scrollKeys.forEach((k, i) => { scrollDist[k] = Number(scrollVals[i] || 0); });

    const uv = Number(uvTotal || 0);
    const cta = Number(ctaTotal || 0);
    const faq = Number(faqTotal || 0);
    const bounce = Number(bounceCount || 0);
    const dc = Number(durCount || 0);

    res.status(200).json({
      pvTotal:    Number(pvTotal || 0),
      uvTotal:    uv,
      avgDur:     dc ? Math.round(Number(durTotal) / dc) : 0,
      bounceCount: bounce,
      bounceRate: uv ? Math.round(bounce / uv * 100) : 0,
      ctaTotal:   cta,
      ctaRate:    uv ? Math.round(cta / uv * 1000) / 10 : 0,
      faqTotal:   faq,
      faqRate:    uv ? Math.round(faq / uv * 1000) / 10 : 0,
      src:        src || {},
      dev:        dev || {},
      ctaLabels:  ctaLabels || {},
      scrollDist,
      sections:   sections || {},
      trend: days.map((d, i) => ({
        date: d,
        pv: Number(dayPairs[i][0] || 0),
        uv: Number(dayPairs[i][1] || 0),
      })),
    });
  } catch (e) {
    console.error('[data]', e.message);
    res.status(500).json({ ...demoData(), error: e.message });
  }
}
