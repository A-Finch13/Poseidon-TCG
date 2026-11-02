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
