import { createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = 'yvs_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const HASH_BYTES = 32;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDisplayName(value, email) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  return (name || email.split('@')[0] || 'Utilisateur').slice(0, 80);
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function passwordError(password) {
  if (password.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères.';
  if (password.length > 256) return 'Le mot de passe est trop long.';
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  }
  return null;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const derived = await scrypt(password, salt, HASH_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${Buffer.from(derived).toString('base64url')}`;
}

async function verifyPassword(password, encoded) {
  try {
    const [algorithm, n, r, p, salt, expectedBase64] = String(encoded).split('$');
    if (algorithm !== 'scrypt' || !salt || !expectedBase64) return false;
    const expected = Buffer.from(expectedBase64, 'base64url');
    const actual = Buffer.from(await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024
    }));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

function requestIsSecure(request, secureOverride) {
  if (secureOverride != null) return Boolean(secureOverride);
  if (request.socket?.encrypted) return true;
  return String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function sessionCookie(token, request, { secure, maxAge = Math.floor(SESSION_TTL_MS / 1000) } = {}) {
  const attributes = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (requestIsSecure(request, secure)) attributes.push('Secure');
  return attributes.join('; ');
}

function safeTokenMatch(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function makeAuthError(message, statusCode = 401, code = 'AUTH_REQUIRED') {
  return Object.assign(new Error(message), { statusCode, code });
}

/** Secure cookie/session authentication backed by the shared data store. */
export function createAuthService(store, options = {}) {
  const registrationEnabled = options.registrationEnabled
    ?? process.env.YVS_ALLOW_REGISTRATION !== 'false';
  const secret = options.sessionSecret
    || process.env.YVS_SESSION_SECRET
    || randomBytes(32).toString('base64url');
  const secureCookie = options.secureCookie
    ?? (process.env.YVS_COOKIE_SECURE === 'true' ? true : process.env.YVS_COOKIE_SECURE === 'false' ? false : undefined);

  function csrfForToken(token) {
    return createHmac('sha256', secret).update(`csrf:${token}`).digest('base64url');
  }

  async function issueSession(user, request, response) {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_TTL_MS);
    await store.createSession({
      tokenHash: sha256(token),
      userId: user.id,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString()
    });
    response.setHeader('Set-Cookie', sessionCookie(token, request, { secure: secureCookie }));
    return { user, csrfToken: csrfForToken(token), expiresAt: expires.toISOString() };
  }

  return {
    registrationEnabled,

    async register(input, request, response) {
      if (!registrationEnabled) throw makeAuthError('Les inscriptions sont désactivées.', 403, 'REGISTRATION_DISABLED');
      const email = normalizeEmail(input.email);
      const password = String(input.password || '');
      if (!isValidEmail(email)) throw makeAuthError('Adresse email invalide.', 400, 'INVALID_EMAIL');
      const invalidPassword = passwordError(password);
      if (invalidPassword) throw makeAuthError(invalidPassword, 400, 'WEAK_PASSWORD');
      if (await store.getUserByEmail(email)) {
        throw makeAuthError('Un compte existe déjà avec cette adresse email.', 409, 'EMAIL_EXISTS');
      }

      const createdAt = new Date().toISOString();
      let user;
      try {
        user = await store.createUser({
          id: randomUUID(),
          email,
          displayName: normalizeDisplayName(input.displayName, email),
          passwordHash: await hashPassword(password),
          createdAt
        });
      } catch (error) {
        if (/unique|constraint/i.test(error.message)) {
          throw makeAuthError('Un compte existe déjà avec cette adresse email.', 409, 'EMAIL_EXISTS');
        }
        throw error;
      }
      return issueSession(user, request, response);
    },

    async login(input, request, response) {
      const email = normalizeEmail(input.email);
      const rawPassword = String(input.password || '');
      const password = rawPassword.length <= 256 ? rawPassword : '';
      const user = isValidEmail(email) ? await store.getUserByEmail(email, { includePassword: true }) : null;
      // Exécuter scrypt même pour un compte absent réduit l'écart de timing qui
      // pourrait autrement servir à deviner les adresses déjà inscrites.
      const valid = user
        ? await verifyPassword(password, user.passwordHash)
        : (await scrypt(password, 'yvs-invalid-account', HASH_BYTES, {
            N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024
          }), false);
      if (!valid) {
        // Keep the public error deliberately generic to avoid account enumeration.
        throw makeAuthError('Email ou mot de passe incorrect.', 401, 'INVALID_CREDENTIALS');
      }
      const { passwordHash: _passwordHash, ...publicUser } = user;
      return issueSession(publicUser, request, response);
    },

    async authenticate(request) {
      const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
      if (!token || token.length > 256) return null;
      const session = await store.getSession(sha256(token));
      if (!session) return null;
      return { ...session, rawToken: token, csrfToken: csrfForToken(token) };
    },

    async requireUser(request) {
      const session = await this.authenticate(request);
      if (!session) throw makeAuthError('Connectez-vous pour continuer.', 401, 'AUTH_REQUIRED');
      return session;
    },

    verifyCsrf(request, session) {
      const candidate = request.headers['x-yvs-csrf'];
      if (!safeTokenMatch(candidate, session.csrfToken)) {
        throw makeAuthError('Jeton de sécurité invalide. Rechargez la page.', 403, 'INVALID_CSRF');
      }
    },

    async logout(request, response, session) {
      if (session) await store.deleteSession(session.tokenHash);
      response.setHeader('Set-Cookie', sessionCookie('', request, { secure: secureCookie, maxAge: 0 }));
    }
  };
}

export const authInternals = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  normalizeEmail,
  passwordError
};
