const fs = require('fs');
const os = require('os');

module.exports = {
  billingCycleUptime() {
    return os.uptime();
  },

  getTerminationTime() {
    return '';
  },

  configure() {
    const configFile = process.env.DOCKER_WORKER_CONFIG;
    if (!configFile || !fs.existsSync(configFile)) {
      throw new Error('No config file found');
    }
    const content = fs.readFileSync(configFile, 'utf8');
    return JSON.parse(content);
  }
};
