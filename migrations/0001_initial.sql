PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE,
  apple_id TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  prof_pic_url TEXT NOT NULL DEFAULT '',
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('google', 'apple')),
  fcm_token TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_status IN ('free', 'monthly', 'annual')),
  subscription_expiry TEXT,
  purchased_tours TEXT NOT NULL DEFAULT '[]',
  favorites TEXT NOT NULL DEFAULT '[]',
  scheduled_deletion TEXT,
  deletion_in_progress INTEGER NOT NULL DEFAULT 0,
  deletion_started_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE experiences (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  locations TEXT NOT NULL DEFAULT '[]',
  user_id TEXT,
  location_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX experiences_location_key_idx ON experiences(location_key);
CREATE INDEX experiences_user_id_idx ON experiences(user_id);

CREATE TABLE api_rate_limits (
  ip TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL
);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  prof_pic_url TEXT,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX feedback_user_id_idx ON feedback(user_id);

CREATE TABLE ratings (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (location_id, user_id)
);
CREATE INDEX ratings_location_id_idx ON ratings(location_id);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  user_id TEXT,
  product_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('one-time', 'subscription')),
  amount REAL NOT NULL,
  transaction_date TEXT NOT NULL,
  expiration_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE tour_descriptions (
  location_id TEXT PRIMARY KEY,
  location_name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  narrations TEXT NOT NULL DEFAULT '{}',
  audio_keys TEXT NOT NULL DEFAULT '{}',
  narration_styles TEXT NOT NULL DEFAULT '{}',
  narration_version INTEGER NOT NULL DEFAULT 4,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
