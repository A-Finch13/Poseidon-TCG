-- Boosters opened by each player, shared between their devices (relay/worker.js).
CREATE TABLE IF NOT EXISTS pity (
  player TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  top INTEGER NOT NULL,
  card TEXT, -- the best card of a SSR, UR or SEC opening (JSON: id, name, image, rarity), for the history
  PRIMARY KEY (player, id)
);
-- On a database made before it: ALTER TABLE pity ADD COLUMN card TEXT;
CREATE INDEX IF NOT EXISTS pity_player_at ON pity (player, at);
-- The player's last SEC (MAX(at) of their openings with top >= SEC) found without reading all their openings.
CREATE INDEX IF NOT EXISTS pity_player_top ON pity (player, top, at);

-- Favourite series of each player, the most recent list (relay/worker.js).
CREATE TABLE IF NOT EXISTS favorites (
  player TEXT PRIMARY KEY,
  list TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- The drawing of every kind of booster's pile, scanned and published by the author for every Aquaman (relay/worker.js).
CREATE TABLE IF NOT EXISTS pack_designs (
  kind TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- The game's "beaux tirages" (SSR, UR, SEC) seen by every Aquaman, public (relay/worker.js).
CREATE TABLE IF NOT EXISTS pulls (
  k TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  serial INTEGER,
  card_name TEXT NOT NULL,
  rarity TEXT NOT NULL,
  image TEXT,
  series TEXT,
  player_id TEXT,
  player_name TEXT,
  pulled_at INTEGER NOT NULL,
  search TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pulls_card ON pulls (card_id, pulled_at);
CREATE INDEX IF NOT EXISTS pulls_at ON pulls (pulled_at);
CREATE INDEX IF NOT EXISTS pulls_player ON pulls (player_id, pulled_at);

-- State of the relay's own reading of the game's feed (relay/worker.js): last try, last success, last answer.
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- The players who use Aquaman (relay/worker.js), seen by the author only (secret ADMIN_TOKEN).
CREATE TABLE IF NOT EXISTS users (
  player TEXT PRIMARY KEY,
  name TEXT,
  kind TEXT,
  version TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  revoked INTEGER -- when the author took Aquaman back from the player (null: allowed)
);
-- On a database made before it: ALTER TABLE users ADD COLUMN revoked INTEGER;

-- The author's devices (relay/worker.js): public key of each device, waiting for approval or approved.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL,
  name TEXT,
  state TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_used INTEGER
);

-- Each Aquaman of a player (relay/worker.js): one line per kind (extension, userscript), so that a player with both
-- shows both; the author's list is built from it.
CREATE TABLE IF NOT EXISTS installs (
  player TEXT NOT NULL,
  kind TEXT NOT NULL,
  version TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (player, kind)
);

-- Cards waiting in Aquaman for a place in the game's search list, and those Aquaman put there, the most recent lists
-- of each player (relay/worker.js).
CREATE TABLE IF NOT EXISTS wants (
  player TEXT PRIMARY KEY,
  waiting TEXT NOT NULL,
  sent TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- Other lists of each player kept the same on all their devices (relay/worker.js, POST /lists): the cards bought on
-- the market whose other sales are hidden ("bought"), the copies waiting for a place on the market ("sales").
CREATE TABLE IF NOT EXISTS lists (
  player TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (player, name)
);

-- The SSR, UR and SEC cards of the players seen in the "beaux tirages", read in their public collections
-- (relay/worker.js): who has which card, for "Qui a cette carte ?".
CREATE TABLE IF NOT EXISTS holdings (
  player_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  count INTEGER NOT NULL,
  serials TEXT,
  PRIMARY KEY (player_id, card_id)
);
CREATE INDEX IF NOT EXISTS holdings_card ON holdings (card_id);

-- When each player's collection was last read, and whether it was private.
CREATE TABLE IF NOT EXISTS scans (
  player_id TEXT PRIMARY KEY,
  player_name TEXT,
  at INTEGER NOT NULL,
  private INTEGER NOT NULL DEFAULT 0,
  cards INTEGER NOT NULL DEFAULT 0
);
