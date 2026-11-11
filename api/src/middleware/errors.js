class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function notFound(req, res, next) {
  next(new HttpError(404, `route ${req.method} ${req.path} not found`));
}

// Express recognises error handlers by their four arguments. `next` is
// unused but required; the ESLint config already ignores it.
function errorHandler(err, req, res, next) {
  // Malformed JSON bodies from express.json()
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'request body too large' });
  }

  const status = err.status || 500;
  const body = { error: status === 500 ? 'internal server error' : err.message };
  if (err.details) body.details = err.details;

  if (status === 500 && process.env.NODE_ENV !== 'test') {
    console.error(err);
  }

  return res.status(status).json(body);
}

module.exports = { HttpError, notFound, errorHandler };
