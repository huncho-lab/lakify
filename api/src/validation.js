// Budapest's 23 districts, same list as the frontend.
const DISTRICTS = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
  'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII',
];

const MAX_PHOTOS = 10;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Field rules. Each check returns an error message or null, and `clean`
 * normalises the accepted value. `required` fields must be present on
 * create (POST) but are optional on update (PATCH).
 */
const FIELDS = {
  title: {
    required: true,
    check: (v) => (typeof v !== 'string' || !v.trim() ? 'title must be a non-empty string'
      : v.trim().length > 120 ? 'title must be at most 120 characters' : null),
    clean: (v) => v.trim(),
  },
  address: {
    required: true,
    check: (v) => (typeof v !== 'string' || !v.trim() ? 'address must be a non-empty string'
      : v.trim().length > 200 ? 'address must be at most 200 characters' : null),
    clean: (v) => v.trim(),
  },
  district: {
    required: true,
    check: (v) => (DISTRICTS.includes(v) ? null : 'district must be a Budapest district from I to XXIII'),
  },
  rent: {
    required: true,
    check: (v) => (Number.isInteger(v) && v > 0 ? null : 'rent must be a positive whole number (Ft per month)'),
  },
  size: {
    required: true,
    check: (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? null : 'size must be a positive number (m²)'),
  },
  rooms: {
    required: true,
    check: (v) => (Number.isInteger(v) && v >= 1 ? null : 'rooms must be a whole number of at least 1'),
  },
  description: {
    required: false,
    default: '',
    check: (v) => (typeof v !== 'string' ? 'description must be a string'
      : v.length > 2000 ? 'description must be at most 2000 characters' : null),
    clean: (v) => v.trim(),
  },
  photos: {
    required: true,
    check: (v) => {
      if (!Array.isArray(v) || v.length === 0) return 'photos must be a non-empty array';
      if (v.length > MAX_PHOTOS) return `photos can contain at most ${MAX_PHOTOS} items`;
      if (!v.every((p) => typeof p === 'string' && p.trim())) return 'each photo must be a non-empty string (URL or data URL)';
      return null;
    },
  },
  proof: {
    required: false,
    default: null,
    check: (v) => (v === null || (isPlainObject(v) && typeof v.name === 'string' && v.name.trim()
      && typeof v.data === 'string' && v.data.trim())
      ? null : 'proof must be null or { name, data } with non-empty strings'),
    clean: (v) => (v === null ? null : { name: v.name.trim(), data: v.data }),
  },
};

/**
 * Validates a listing payload. With `partial: true` (PATCH) every field is
 * optional but at least one must be given. Unknown fields are ignored.
 * Returns { errors, value } where value holds only allowed, cleaned fields.
 */
function validateListing(body, { partial = false } = {}) {
  if (!isPlainObject(body)) return { errors: ['body must be a JSON object'], value: {} };

  const errors = [];
  const value = {};

  for (const [name, rule] of Object.entries(FIELDS)) {
    const raw = body[name];
    if (raw === undefined) {
      if (partial) continue;
      if (rule.required) errors.push(`${name} is required`);
      else value[name] = rule.default;
      continue;
    }
    const error = rule.check(raw);
    if (error) errors.push(error);
    else value[name] = rule.clean ? rule.clean(raw) : raw;
  }

  if (partial && errors.length === 0 && Object.keys(value).length === 0) {
    errors.push(`provide at least one of: ${Object.keys(FIELDS).join(', ')}`);
  }

  return { errors, value };
}

/** Parses listing query filters; returns { errors, filters }. */
function parseFilters(query) {
  const errors = [];
  const filters = {};

  if (query.district !== undefined) {
    if (DISTRICTS.includes(query.district)) filters.district = query.district;
    else errors.push('district must be a Budapest district from I to XXIII');
  }

  for (const [key, min] of [['maxRent', 1], ['minRooms', 1]]) {
    if (query[key] === undefined) continue;
    const n = Number(query[key]);
    if (/^\d+$/.test(query[key]) && n >= min) filters[key] = n;
    else errors.push(`${key} must be a positive whole number`);
  }

  return { errors, filters };
}

module.exports = { validateListing, parseFilters, DISTRICTS, MAX_PHOTOS };
