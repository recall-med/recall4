-- Recall cloud sync schema (Cloudflare D1). Paste into the D1 console.
CREATE TABLE users (
  uid TEXT PRIMARY KEY,
  reset_epoch INTEGER NOT NULL DEFAULT 0,
  session_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  session TEXT
);

CREATE TABLE scopes (
  uid TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT '{}',
  incorrect TEXT NOT NULL DEFAULT '{}',
  flags TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, scope_key)
);

CREATE TABLE attempts (
  uid TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  client_ts INTEGER,
  module TEXT, exam_type TEXT, subject TEXT, sub_subject TEXT, scope TEXT,
  score INTEGER, correct INTEGER, total INTEGER, attempted INTEGER, time_sec INTEGER,
  review TEXT,
  PRIMARY KEY (uid, attempt_id)
);
CREATE INDEX attempts_by_time ON attempts (uid, created_at);
