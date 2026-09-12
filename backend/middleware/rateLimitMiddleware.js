const ipRequests = new Map();

// Periodically prune stale IP tracker records to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequests.entries()) {
    if (now > record.resetTime) {
      ipRequests.delete(ip);
    }
  }
}, 60000);

module.exports = (maxRequests, windowMs) => {
  return (req, res, next) => {
    // Retrieve client IP
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const now = Date.now();

    if (!ipRequests.has(ip)) {
      ipRequests.set(ip, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    const record = ipRequests.get(ip);

    // If window interval has passed, reset the bucket count
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfterSeconds));

      // Handle response formats appropriately
      if (req.xhr || req.headers.accept?.includes('json') || req.path === '/login') {
        return res.status(429).json({
          message: `Too many authorization attempts. Please try again in ${retryAfterSeconds} seconds.`
        });
      } else {
        return res.status(429).send(`Too many validation requests. Please try again in ${retryAfterSeconds} seconds.`);
      }
    }

    next();
  };
};
