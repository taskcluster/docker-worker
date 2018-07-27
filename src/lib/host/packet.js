/**
Return the appropriate configuration defaults when on packet.net.
*/

const Debug = require('debug');
const got = require('got-promise');
const { createLogger } = require('../log');
const { spawn } = require('child_process');
const os = require('os');
const assert = require('assert');

const debug = Debug('docker-worker:host:packet');

const log = createLogger({
  source: 'host/packet'
});

module.exports = {
  async configure() {
    try {
      const res = await got('https://metadata.packet.net/metadata');
      const data = JSON.parse(res.body);
      const publicIp = data.network.addresses
        .filter(addr => addr.address_family === 4 && addr.public)
        .map(addr => addr.address)[0];
      const privateIp = data.network.addresses
        .filter(addr => addr.address_family === 4 && !addr.public)
        .map(addr => addr.address)[0];

      assert(publicIp);
      assert(privateIp);

      const config = {
        taskcluster: {
          clientId: process.env.TASKCLUSTER_CLIENT_ID,
          accessToken: process.env.TASKCLUSTER_ACCESS_TOKEN,
        },
        host: data.hostname,
        publicIp,
        privateIp,
        workerNodeType: 'packet.net',
        instanceId: data.id,
        workerId: process.env.WORKER_ID,
        workerGroup: process.env.WORKER_GROUP,
        provisionerId: process.env.PROVISIONER_ID,
        region: data.facility,
        instanceType: data.plan,
        capacity: process.env.CAPACITY,
        workerType: process.env.WORKER_TYPE,
        shutdown: {
          enabled: true,
          afterIdleSeconds: 100 * 60 * 60, // 100 hours
        },
      };
      return config;
    } catch (e) {
      log('[alert-operator] error retrieving secrets', {stack: e.stack});
      spawn('shutdown', ['-h', 'now']);
    }
  },
  getTerminationTime() {
    return false;
  },
  billingCycleUptime() {
    return os.uptime();
  },
};
