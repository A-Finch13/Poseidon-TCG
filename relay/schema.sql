-- Certains éléments sont gardés pour la rétro-compatibilité

-- Boosters ouverts par chaque joueur, partagés entre ses appareils (relay/worker.js).
CREATE TABLE IF NOT EXISTS pity (
  player TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  top INTEGER NOT NULL,
  card TEXT, -- la meilleure carte d'une ouverture SSR, UR ou SEC (JSON : id, name, image, rarity), pour l'historique
  PRIMARY KEY (player, id)
);
-- Sur une base créée avant : ALTER TABLE pity ADD COLUMN card TEXT;
CREATE INDEX IF NOT EXISTS pity_player_at ON pity (player, at);
-- La dernière SEC du joueur (MAX(at) de ses ouvertures avec top >= SEC) trouvée sans lire toutes ses ouvertures.
CREATE INDEX IF NOT EXISTS pity_player_top ON pity (player, top, at);

-- Séries favorites de chaque joueur, la liste la plus récente (relay/worker.js).
CREATE TABLE IF NOT EXISTS favorites (
  player TEXT PRIMARY KEY,
  list TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- Séries favorites transférées pour chaque joueur (relay/worker.js).
CREATE TABLE IF NOT EXISTS favorites_transferred (
  player TEXT PRIMARY KEY,
  transferred BOOLEAN NOT NULL DEFAULT 0
);

-- Le dessin de la pile de chaque sorte de booster, relevé et publié par l'auteur pour chaque Aquaman (relay/worker.js).
CREATE TABLE IF NOT EXISTS pack_designs (
  kind TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- Les « beaux tirages » du jeu (SSR, UR, SEC) vus par chaque Aquaman, publics (relay/worker.js).
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

-- État de la lecture du fil du jeu par le relais lui-même (relay/worker.js) : dernier essai, dernière réussite,
-- dernière réponse.
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Les joueurs qui utilisent Aquaman (relay/worker.js), vus par l'auteur seulement (secret ADMIN_TOKEN).
CREATE TABLE IF NOT EXISTS users (
  player TEXT PRIMARY KEY,
  name TEXT,
  kind TEXT,
  version TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  revoked INTEGER, -- quand l'auteur a retiré Aquaman au joueur (null : autorisé)
  perles INTEGER, -- plus utilisé (le classement par Perles n'existe plus) : vidé au prochain bonjour du joueur
  perles_at INTEGER
);
-- Sur une base créée avant : ALTER TABLE users ADD COLUMN revoked INTEGER;
-- ALTER TABLE users ADD COLUMN perles INTEGER; ALTER TABLE users ADD COLUMN perles_at INTEGER;

-- Les appareils de l'auteur (relay/worker.js) : clé publique de chaque appareil, en attente d'approbation ou approuvé.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL,
  name TEXT,
  state TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_used INTEGER
);

-- Chaque Aquaman d'un joueur (relay/worker.js) : une ligne par sorte (extension, userscript), pour qu'un joueur qui a
-- les deux montre les deux ; la liste de l'auteur est faite à partir d'elle.
CREATE TABLE IF NOT EXISTS installs (
  player TEXT NOT NULL,
  kind TEXT NOT NULL,
  version TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (player, kind)
);

-- Cartes en attente dans Aquaman d'une place dans la liste de recherche du jeu, et celles qu'Aquaman y a mises, les
-- listes les plus récentes de chaque joueur (relay/worker.js).
CREATE TABLE IF NOT EXISTS wants (
  player TEXT PRIMARY KEY,
  waiting TEXT NOT NULL,
  sent TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- Autres listes de chaque joueur gardées identiques sur tous ses appareils (relay/worker.js, POST /lists) : les cartes
-- achetées sur le marché dont les autres ventes sont cachées (« bought »), les exemplaires en attente d'une place sur
-- le marché (« sales »).
CREATE TABLE IF NOT EXISTS lists (
  player TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (player, name)
);

-- Les cartes SSR, UR et SEC des joueurs vus dans les « beaux tirages », lues dans leurs collections publiques
-- (relay/worker.js) : qui a quelle carte, pour « Qui a cette carte ? ».
CREATE TABLE IF NOT EXISTS holdings (
  player_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  count INTEGER NOT NULL,
  serials TEXT,
  PRIMARY KEY (player_id, card_id)
);
CREATE INDEX IF NOT EXISTS holdings_card ON holdings (card_id);

-- Quand la collection de chaque joueur a été lue pour la dernière fois, et si elle était privée.
CREATE TABLE IF NOT EXISTS scans (
  player_id TEXT PRIMARY KEY,
  player_name TEXT,
  at INTEGER NOT NULL,
  private INTEGER NOT NULL DEFAULT 0,
  cards INTEGER NOT NULL DEFAULT 0
);
