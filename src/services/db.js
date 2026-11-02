export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getUser(db, id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}

export function mapUser(row) {
  if (!row) return null;
  return {
    _id: row.id,
    googleId: row.google_id,
    appleId: row.apple_id,
    email: row.email,
    name: row.name,
    profPicUrl: row.prof_pic_url,
    authProvider: row.auth_provider,
    fcmToken: row.fcm_token,
    subscription: {
      status: row.subscription_status,
      expiryDate: row.subscription_expiry,
    },
    purchasedTours: JSON.parse(row.purchased_tours || "[]"),
    favorites: JSON.parse(row.favorites || "[]"),
    scheduledDeletion: row.scheduled_deletion,
    deletionInProgress: Boolean(row.deletion_in_progress),
    deletionStartedAt: row.deletion_started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveUser(db, user) {
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO users (
      id, google_id, apple_id, email, name, prof_pic_url, auth_provider,
      fcm_token, subscription_status, subscription_expiry, purchased_tours,
      favorites, scheduled_deletion, deletion_in_progress, deletion_started_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      google_id = excluded.google_id, apple_id = excluded.apple_id,
      email = excluded.email, name = excluded.name, prof_pic_url = excluded.prof_pic_url,
      auth_provider = excluded.auth_provider, fcm_token = excluded.fcm_token,
      subscription_status = excluded.subscription_status,
      subscription_expiry = excluded.subscription_expiry,
      purchased_tours = excluded.purchased_tours, favorites = excluded.favorites,
      scheduled_deletion = excluded.scheduled_deletion,
      deletion_in_progress = excluded.deletion_in_progress,
      deletion_started_at = excluded.deletion_started_at, updated_at = excluded.updated_at
  `).bind(
    user._id,
    user.googleId || null,
    user.appleId || null,
    user.email,
    user.name || "",
    user.profPicUrl || "",
    user.authProvider,
    user.fcmToken || null,
    user.subscription?.status || "free",
    user.subscription?.expiryDate ? new Date(user.subscription.expiryDate).toISOString() : null,
    JSON.stringify(user.purchasedTours || []),
    JSON.stringify(user.favorites || []),
    user.scheduledDeletion ? new Date(user.scheduledDeletion).toISOString() : null,
    user.deletionInProgress ? 1 : 0,
    user.deletionStartedAt ? new Date(user.deletionStartedAt).toISOString() : null,
    user.createdAt || now,
    now,
  ).run();
}

export function mapExperience(row) {
  return {
    _id: row.id,
    title: row.title,
    description: row.description,
    locations: JSON.parse(row.locations || "[]"),
    user_id: row.user_id,
    locationKey: row.location_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getExperiencesByIds(db, ids) {
  if (!ids?.length) return [];
  const found = new Map();
  for (let offset = 0; offset < ids.length; offset += 80) {
    const batch = ids.slice(offset, offset + 80);
    const placeholders = batch.map(() => "?").join(",");
    const result = await db.prepare(`SELECT * FROM experiences WHERE id IN (${placeholders})`)
      .bind(...batch).all();
    for (const row of result.results || []) found.set(row.id, mapExperience(row));
  }
  return ids.map((id) => found.get(id)).filter(Boolean);
}

export async function saveExperience(db, experience) {
  const id = experience._id || newId();
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO experiences (id, title, description, locations, user_id, location_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    experience.title,
    experience.description,
    JSON.stringify(experience.locations || []),
    experience.user_id === "system" ? null : experience.user_id || null,
    experience.locationKey || null,
    experience.createdAt || now,
    now,
  ).run();
  return { ...experience, _id: id, createdAt: experience.createdAt || now, updatedAt: now };
}

export function isValidId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}
