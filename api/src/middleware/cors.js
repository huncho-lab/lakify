/**
 * Minimal CORS so the Lakify frontend (served from another port, e.g. Live
 * Server on 5501) can call the API. Set CORS_ORIGIN to lock it to one origin.
 */
function cors(origin) {
  return (req, res, next) => {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  };
}

module.exports = cors;
