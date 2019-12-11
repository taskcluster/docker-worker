const Debug = require('debug');
const fs = require('fs');

let debug = Debug('taskcluster-docker-worker:devices:sharedMemoryManager');

class SharedMemoryDeviceManager {
  constructor() {
    this.devices = [new SharedMemoryDevice("/dev/shm")];
    this.unlimitedDevices = true;
  }

  getAvailableDevice() {
    let devices = this.getAvailableDevices();
    let device = devices[0];
    device.acquire();

    debug(`Device: ${device.path} acquired`);

    return device;
  }

  getAvailableDevices() {
    return this.devices;
  }
}

class SharedMemoryDevice {
  constructor(path) {
    this.path = path;

    if (path !== "/dev/shm") {
      throw new Error('SharedMemoryDevice only operates on /dev/shm');
    }

    this.mountPoints = [
      "/dev/shm"
    ];
  }

  acquire() {}

  release() {
    debug(`Device: ${this.path} released`);
  }

}

module.exports = SharedMemoryDeviceManager;
