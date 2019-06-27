const fs = require('fs');
const os = require('os');
const {StreamTransport, Protocol} = require('../worker-runner-protocol');

// This module is imported as an "object", so the only place we have to store
// persistent state is as module-level globals.
let protocol;

module.exports = {
  setup() {
    const transp = new StreamTransport(process.stdin, process.stdout);
    protocol = new Protocol(transp, new Set([
    ]));
  },

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
