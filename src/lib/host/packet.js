/**
Return the appropriate configuration defaults when on packet.net.
*/

const Debug = require('debug');
const got = require('got-promise');
const { createLogger } = require('../log');
const { spawn } = require('child_process');

const debug = Debug('docker-worker:host:packet');

const log = createLogger({
  source: 'host/packet'
});

module.exports = {
  async configure() {
    try {
      const res = await got('https://metadata.packet.net/metadata');
      const data = JSON.parse(res.body);
      const publicIp = data.address
        .filter(addr => addr.address_family === 4 && addr.publicIp)
        .map(addr => addr.address)[0];
      const privateIp = data.address
        .filter(addr => addr.address_family === 4 && !addr.publicIp)
        .map(addr => addr.address)[0];

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
        workerId: data.id,
        workerGroup: data.facility,
        region: data.facility,
        instanceType: data.plan,
        shutdown: {
          enabled: true,
          afterIdleSeconds: 15 * 60, // 15 minutes
        },
      };
      return config;
    } catch (e) {
      log('[alert-operator] error retrieving secrets', {stack: e.stack});
      spawn('shutdown', ['-h', 'now']);
    }
  }
};
