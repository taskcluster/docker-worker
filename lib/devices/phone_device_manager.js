import assert from 'assert';
import Debug from 'debug';

import Testdroid from 'testdroid-client';

let debug = Debug('taskcluster-docker-worker:devices:phoneManager');

export default class PhoneDeviceManager {
  constructor(config) {
    assert(config.deviceManagement.phone.sims, "Must supply the number of sims required");
    assert(config.deviceManagement.phone.type, "Must supply the type of phone");
    assert(config.testdroid, "Must supply testdroid configuration");
    assert(config.testdroid.url, "Must supply testdroid cloud url");
    assert(config.testdroid.username, "Must supply testdroid cloud username");
    assert(config.testdroid.password, "Must supply testdroid cloud password");

    this.config = config;
    this.client = new Testdroid(
        config.testdroid.url,
        config.testdroid.username,
        config.testdroid.password
    );
    this.deviceFilter = {
      'type': config.deviceManagement.phone.type,
      'sims': config.deviceManagement.phone.sims
    };
  }

  async devices() {
    let devices = await this.client.getDevices(this.deviceFilter);
    let deviceList = devices.map((device) => {
      return new Phone(device);
    });

    debug(`List of ${deviceList.length} phones created`)
    return deviceList;
  }

  async getAvailableDevice() {
    let devices = await this.getAvailableDevices();
    if (!devices.length) {
      throw new Error('Fatal error... Could not acquire testdroid device');
    }

    debug('Acquiring available testdroid device');

    let device = devices[0];
    device.acquire();

    return device;
  }

  async getAvailableDevices() {
    let devices = await this.devices()

    return devices.filter((device) => {
      return device.active === false;
    });
  }
}

class Phone {
  constructor(deviceInfo) {
    this.id = deviceInfo.id;
    this.active = (deviceInfo.online && deviceInfo.locked !== false);
    this.mountPoints = [];
  }

  acquire() {
    // Not yet implemented
    return
  }

  release() {
    // Not yet implemented
    return
  }
}
