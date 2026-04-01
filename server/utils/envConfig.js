/**
 * envConfig.js — Central Environment Configuration
 *
 * Controls which "tier" the server is running in:
 *   local      → your developer machine (writes to dev_ collections)
 *   beta       → Netlify branch/preview deploy (writes to beta_ collections)
 *   production → Netlify main deploy (writes to bare collections)
 *
 * Set APP_ENV in your .env (local) or Netlify environment variables (cloud).
 * If APP_ENV is not set:
 *   - On Netlify (NETLIFY=true) → defaults to 'production' (safe fallback)
 *   - Otherwise               → defaults to 'local'
 */

const VALID_ENVS = ['local', 'beta', 'production'];

const _raw = process.env.APP_ENV;
const _netlify = !!process.env.NETLIFY;

let ENV;
if (_raw && VALID_ENVS.includes(_raw)) {
    ENV = _raw;
} else if (_netlify) {
    // Safe fallback on cloud: if APP_ENV is missing, treat as production
    // (no prefix = production collections). Log a warning.
    console.warn('[EnvConfig] WARNING: APP_ENV not set on Netlify. Defaulting to "production".');
    console.warn('[EnvConfig] Set APP_ENV=production explicitly in Netlify Site Settings.');
    ENV = 'production';
} else {
    // Safe fallback locally: treat as local dev (prefixed collections)
    ENV = 'local';
}

const ENV_PREFIX_MAP = {
    local: 'dev_',
    beta: 'beta_',
    production: ''
};

/**
 * Returns the Firestore collection prefix for the current environment.
 * e.g. 'dev_' | 'beta_' | ''
 */
const getEnvPrefix = () => ENV_PREFIX_MAP[ENV] ?? 'dev_';

/**
 * Returns true only when running in the production environment.
 * Use this to guard backup hooks, seeding, etc.
 */
const isProduction = () => ENV === 'production';

/**
 * Returns true when running locally (dev machine).
 */
const isLocal = () => ENV === 'local';

// Log the active environment on startup
console.log(`[EnvConfig] Active environment: "${ENV}" | Collection prefix: "${getEnvPrefix() || '(none — production)'}"`);

module.exports = { ENV, getEnvPrefix, isProduction, isLocal };
