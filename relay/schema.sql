-- Boosters opened by each player, shared between their devices (relay/worker.js).
CREATE TABLE IF NOT EXISTS pity (
  player TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  top INTEGER NOT NULL,
  PRIMARY KEY (player, id)
);
CREATE INDEX IF NOT EXISTS pity_player_at ON pity (player, at);

-- Favourite series of each player, the most recent list (relay/worker.js).
CREATE TABLE IF NOT EXISTS favorites (
  player TEXT PRIMARY KEY,
  list TEXT NOT NULL,
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
  last_seen INTEGER NOT NULL
);

-- The author's devices (relay/worker.js): public key of each device, waiting for approval or approved.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL,
  name TEXT,
  state TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_used INTEGER
);
