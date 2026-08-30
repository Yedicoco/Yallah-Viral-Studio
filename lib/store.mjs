import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DATABASE_PATH = join(root, 'data', 'yallah-viral-studio.db');
const MAX_PROJECTS_PER_USER = 100;

function normalizeDatabaseUrl(value) {
  if (!value) return `file:${DEFAULT_DATABASE_PATH}`;
  if (/^(?:file|libsql|https?|wss?):/i.test(value)) return value;
  return `file:${isAbsolute(value) ? value : join(root, value)}`;
}

async function ensureLocalDirectory(url) {
  if (!url.startsWith('file:')) return;
  const rawPath = decodeURIComponent(url.slice('file:'.length).split('?')[0]);
  await mkdir(dirname(rawPath), { recursive: true });
}

function firstRow(result) {
  return result.rows?.[0] || null;
}

function numberValue(value) {
  return typeof value === 'bigint' ? Number(value) : Number(value || 0);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name || ''),
    createdAt: String(row.created_at)
  };
}

function parseProject(row) {
  if (!row) return null;
  try {
    const project = JSON.parse(String(row.project_json));
    return {
      ...project,
      savedAt: String(row.updated_at),
      storageId: String(row.id)
    };
  } catch {
    return null;
  }
}

/**
 * Persistent multi-user data store.
 *
 * Local development uses a SQLite file through libSQL. In production, the same
 * code targets a managed libSQL/Turso database with YVS_DATABASE_URL and
 * YVS_DATABASE_AUTH_TOKEN. Password hashes and session hashes never leave the
 * server API.
 */
export async function createDataStore(options = {}) {
  const url = normalizeDatabaseUrl(options.url || process.env.YVS_DATABASE_URL);
  const authToken = options.authToken ?? process.env.YVS_DATABASE_AUTH_TOKEN;
  await ensureLocalDirectory(url);

  const client = createClient({ url, authToken });
  await client.batch([
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    'CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)',
    'CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)',
    `CREATE TABLE IF NOT EXISTS projects (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      project_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    'CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON projects(user_id, updated_at DESC)'
  ], 'write');

  async function getUserByEmail(email, { includePassword = false } = {}) {
    const result = await client.execute({
      sql: `SELECT id, email, display_name, created_at${includePassword ? ', password_hash' : ''}
            FROM users WHERE email = ? COLLATE NOCASE LIMIT 1`,
      args: [email]
    });
    const row = firstRow(result);
    if (!row) return null;
    return includePassword ? { ...publicUser(row), passwordHash: String(row.password_hash) } : publicUser(row);
  }

  async function getUserById(id) {
    const result = await client.execute({
      sql: 'SELECT id, email, display_name, created_at FROM users WHERE id = ? LIMIT 1',
      args: [id]
    });
    return publicUser(firstRow(result));
  }

  return {
    info: {
      kind: url.startsWith('file:') ? 'sqlite-local' : 'libsql-cloud',
      persistent: true,
      multiUser: true
    },

    async createUser({ id, email, displayName, passwordHash, createdAt }) {
      await client.execute({
        sql: 'INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [id, email, displayName, passwordHash, createdAt]
      });
      return { id, email, displayName, createdAt };
    },

    getUserByEmail,
    getUserById,

    async createSession({ tokenHash, userId, createdAt, expiresAt }) {
      await client.execute({
        sql: 'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        args: [tokenHash, userId, createdAt, expiresAt]
      });
    },

    async getSession(tokenHash) {
      const result = await client.execute({
        sql: `SELECT s.token_hash, s.user_id, s.created_at, s.expires_at,
                     u.email, u.display_name, u.created_at AS user_created_at
              FROM sessions s
              JOIN users u ON u.id = s.user_id
              WHERE s.token_hash = ? AND s.expires_at > ?
              LIMIT 1`,
        args: [tokenHash, new Date().toISOString()]
      });
      const row = firstRow(result);
      if (!row) return null;
      return {
        tokenHash: String(row.token_hash),
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at),
        user: {
          id: String(row.user_id),
          email: String(row.email),
          displayName: String(row.display_name || ''),
          createdAt: String(row.user_created_at)
        }
      };
    },

    async deleteSession(tokenHash) {
      await client.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [tokenHash] });
    },

    async deleteExpiredSessions() {
      await client.execute({ sql: 'DELETE FROM sessions WHERE expires_at <= ?', args: [new Date().toISOString()] });
    },

    async saveProject(userId, project) {
      const now = new Date().toISOString();
      const id = String(project.id);
      const title = String(project.title || 'Projet sans titre').slice(0, 240);
      const serialized = JSON.stringify(project);
      await client.execute({
        sql: `INSERT INTO projects (user_id, id, title, project_json, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, id) DO UPDATE SET
                title = excluded.title,
                project_json = excluded.project_json,
                updated_at = excluded.updated_at`,
        args: [userId, id, title, serialized, project.createdAt || now, now]
      });

      // Keep storage bounded per account without affecting other users.
      await client.execute({
        sql: `DELETE FROM projects
              WHERE user_id = ? AND id IN (
                SELECT id FROM projects WHERE user_id = ?
                ORDER BY updated_at DESC LIMIT -1 OFFSET ?
              )`,
        args: [userId, userId, MAX_PROJECTS_PER_USER]
      });
      return { ...project, savedAt: now, storageId: id };
    },

    async listProjects(userId, { limit = 24 } = {}) {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 24));
      const result = await client.execute({
        sql: `SELECT id, project_json, updated_at FROM projects
              WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`,
        args: [userId, safeLimit]
      });
      return result.rows.map(parseProject).filter(Boolean);
    },

    async getProject(userId, id) {
      const result = await client.execute({
        sql: 'SELECT id, project_json, updated_at FROM projects WHERE user_id = ? AND id = ? LIMIT 1',
        args: [userId, id]
      });
      return parseProject(firstRow(result));
    },

    async deleteProject(userId, id) {
      const result = await client.execute({
        sql: 'DELETE FROM projects WHERE user_id = ? AND id = ?',
        args: [userId, id]
      });
      return numberValue(result.rowsAffected) > 0;
    },

    async clearProjects(userId) {
      const result = await client.execute({ sql: 'DELETE FROM projects WHERE user_id = ?', args: [userId] });
      return numberValue(result.rowsAffected);
    },

    async close() {
      client.close();
    }
  };
}
