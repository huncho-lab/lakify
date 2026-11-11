const { errorHandler, HttpError } = require('../src/middleware/errors');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('errorHandler', () => {
  test('hides internal error messages behind a generic 500', () => {
    const res = mockRes();
    errorHandler(new Error('db password is hunter2'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'internal server error' });
  });

  test('logs unexpected errors outside the test environment', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(new Error('boom'), {}, mockRes(), () => {});
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    process.env.NODE_ENV = original;
  });

  test('passes through HttpError status, message and details', () => {
    const res = mockRes();
    errorHandler(new HttpError(422, 'nope', ['x']), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: 'nope', details: ['x'] });
  });
});
