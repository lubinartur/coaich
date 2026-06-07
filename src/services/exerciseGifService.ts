/**
 * Resolves exercise demo images from the free, no-auth `free-exercise-db` dataset
 * (https://github.com/yuhonas/free-exercise-db). The dataset exposes static images
 * (relative paths under `images`), so URLs returned here are JPG/GIF demo images.
 *
 * The full dataset is fetched once and cached in memory; resolved per-exercise URLs are
 * additionally persisted to localStorage so expanding a card doesn't re-resolve every time.
 */

const DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const CACHE_KEY = 'coaich-gif-cache';

interface RawExercise {
  name: string;
  /** Some forks expose a direct gifUrl; the canonical dataset uses relative `images`. */
  gifUrl?: string;
  images?: string[];
  bodyPart?: string;
  equipment?: string;
  target?: string;
}

/** name -> resolved url (or null when no image was found, to skip future lookups). */
type GifCache = Record<string, string | null>;

let dbPromise: Promise<RawExercise[]> | null = null;

function loadExerciseDb(): Promise<RawExercise[]> {
  if (!dbPromise) {
    dbPromise = fetch(DB_URL)
      .then((res) => (res.ok ? (res.json() as Promise<RawExercise[]>) : []))
      .then((list) => (Array.isArray(list) ? list : []))
      .catch(() => []);
  }
  return dbPromise;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function readCache(): GifCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as GifCache) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: GifCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota / private-mode errors
  }
}

function exerciseToUrl(ex: RawExercise): string | null {
  if (ex.gifUrl && ex.gifUrl.trim()) return ex.gifUrl;
  if (ex.images && ex.images.length > 0) return `${IMAGE_BASE}${ex.images[0]}`;
  return null;
}

function resolveUrl(db: RawExercise[], normalized: string): string | null {
  // Exact normalized-name match first.
  const exact = db.find((e) => normalizeName(e.name) === normalized);
  if (exact) return exerciseToUrl(exact);

  // Partial match: dataset name contains our query, or vice versa (guard against trivial hits).
  const partial = db.find((e) => {
    const n = normalizeName(e.name);
    if (!n) return false;
    if (n.includes(normalized) && normalized.length >= 4) return true;
    if (normalized.includes(n) && n.length >= 5) return true;
    return false;
  });
  return partial ? exerciseToUrl(partial) : null;
}

/**
 * Resolve a demo image URL for an exercise name, or `null` when none is found.
 * Results (including misses) are cached in localStorage by normalized name.
 */
export async function getExerciseGif(exerciseName: string): Promise<string | null> {
  const normalized = normalizeName(exerciseName);
  if (!normalized) return null;

  const cache = readCache();
  if (Object.prototype.hasOwnProperty.call(cache, normalized)) {
    return cache[normalized];
  }

  const db = await loadExerciseDb();
  const url = resolveUrl(db, normalized);
  cache[normalized] = url;
  writeCache(cache);
  return url;
}
