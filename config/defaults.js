module.exports = {
  statsd: {
    prefix: process.env.STATSD_PREFIX || '',
    url: process.env.STATSD_URL || 'tcp://localhost:8125'
  }
};
