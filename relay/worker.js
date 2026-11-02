// Aquaman relay (Cloudflare Worker): shares the boosters a player opens between their devices,
// so that the pity counters are the same on the computer and the phone, extension or userscript.
// It keeps, for each player id, the boosters opened: { id, at, top } (booster id, time, best rarity rank). Nothing else.
// Binding: DB (D1 database, schema.sql).

const KEEP = 500; // openings sent back, the most recent: more than the longest pity
const MAX_IN = 200; // openings accepted in one request
const MAX_BODY = 64 * 1024;
const YEAR = 365 * 86400e3;
const PLAYER = /^[A-Za-z0-9_-]{6,64}$/;
const BOOSTER = /^[A-Za-z0-9_.:-]{1,64}$/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400'
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (req.method === 'POST' && pathname === '/pity') return json(await pity(env, await readBody(req)));
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: e?.message || 'bad_request' }, 400);
    }
  },

  // Once a day: forgets the openings older than a year.
  async scheduled(event, env) {
    await env.DB.prepare('DELETE FROM pity WHERE at < ?1').bind(Date.now() - YEAR).run();
  }
};

// JSON body of a request, refused above MAX_BODY.
async function readBody(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Error('too_large');
  return JSON.parse(text);
}

// True for an opening as sent by the extension.
function valid(e) {
  const now = Date.now();
  return e && typeof e.id === 'string' && BOOSTER.test(e.id) && Number.isFinite(e.at) && e.at > now - YEAR && e.at < now + 86400e3 && Number.isInteger(e.top) && e.top >= 0 && e.top <= 6;
}

// Adds the player's new openings, then sends back all of their recent ones.
async function pity(env, body) {
  const player = String(body?.player ?? '');
  if (!PLAYER.test(player)) throw new Error('bad_player');
  const events = (Array.isArray(body.events) ? body.events : []).slice(0, MAX_IN).filter(valid);
  if (events.length)
    await env.DB.batch(events.map((e) => env.DB.prepare('INSERT OR IGNORE INTO pity (player, id, at, top) VALUES (?1, ?2, ?3, ?4)').bind(player, e.id, Math.round(e.at), e.top)));
  const { results } = await env.DB.prepare('SELECT id, at, top FROM pity WHERE player = ?1 ORDER BY at DESC LIMIT ?2').bind(player, KEEP).all();
  return { events: results.reverse() };
}
