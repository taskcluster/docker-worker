const Debug = require('debug');
const fs = require('fs');

let debug = Debug('taskcluster-docker-worker:devices:sharedMemoryManager');

class SharedMemoryDeviceManager {
  constructor() {
    this.devices = this.buildDeviceList();
  }

  buildDeviceList() {
    let deviceList = ["/dev/shm"];
    return deviceList;
  }

  getAvailableDevice() {
    let devices = this.getAvailableDevices();
    if (!devices.length) {
      throw new Error(`
        Fatal error... Could not acquire shared memory device: ${JSON.stringify(this.devices)}
      `);
    }

    debug('Acquiring available device');

    let device = devices[0];
    device.acquire();

    debug(`Device: ${device.path} acquired`);

    return device;
  }

  getAvailableDevices() {
    return this.devices.filter((device) => {
      return device.active === false;
    });
  }
}

class SharedMemoryDevice {
  constructor(path, active=false) {
    this.path = path;
    this.active = active;

    if (path !== "/dev/shm") {
      throw new Error('SharedMemoryDevice only operates on /dev/shm');
    }

    this.mountPoints = [
      "/dev/shm"
    ];
  }

  acquire() {
    if (this.active) {
      throw new Error('Device has already been acquired');
    }
    this.active = true;
  }

  release() {
    debug(`Device: ${this.path} released`);
    this.active = false;
  }

}

module.exports = SharedMemoryDeviceManager;
