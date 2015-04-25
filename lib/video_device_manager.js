import Debug from 'debug';

let debug = Debug('taskcluster-docker-worker:devices:videoManager');

export default class VideoDeviceManager {
  constructor() {
    this.devices = this.buildDeviceList(10);
  }

  buildDeviceList(numberOfDevices) {
    let devices = [];
    for (let i =0; i < numberOfDevices; i++) {
      devices.push(new VideoDevice(i));
    }

    debug(`
      List of ${numberOfDevices} video devices created.
      ${JSON.stringify(devices, null, 2)}
    `);

    return devices;
  }

  getAvailableDevice() {
    debug('Aquiring available video device');
    for (let device of this.devices) {
      if (device.active) continue;
      device.aquire();
      debug(`Device id: ${device.id} aquired`);
      return device;
    }

    throw new Error(`
      Fatal error... Could not aquire video device:

      ${JSON.stringify(this.devices)}
    `);
  }
}

class VideoDevice {
  constructor(id, active=false) {
    this.id = id;
    this.active = active;
    this.mountPoints = [`/dev/video${id}`];
  }

  aquire() {
    if (this.active) throw new Error('Device has already been aquired');
    this.active = true;
  }

  release() {
    debug(`Device id: ${this.id} released`);
    this.active = false;
  }

}
