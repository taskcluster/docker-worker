import * as settings from '../settings';
import TestWorker from '../testworker';
import DockerWorker from '../dockerworker';
import cmd from './helper/cmd';
import app from '../fixtures/testdroid_cloud';
import http from 'http';
import waitForEvent from '../../lib/wait_for_event';
import os from 'os';

suite('device linking within containers', () => {

  let worker;

  setup(async () => {
    settings.cleanup();
  });

  teardown(async() => {
    settings.cleanup();
    await worker.terminate();
  });

  test('link valid video loopback device', async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
    var task = {
      scopes: ["docker-worker:capability:device:loopbackVideo"],
      payload: {
        capabilities: {
          devices: {
            'loopbackVideo': true
          }
        },
        image: 'ubuntu:14.10',
        command: cmd(
          "ls /dev",
          "test -c /dev/video0 || { echo 'Device not found' ; exit 1; }"
        ),
        maxRunTime:         5 * 60
      }
    };

    let result = await worker.postToQueue(task);

    assert.equal(result.status.state, 'completed', 'Task state is not marked as completed');
    assert.equal(
      result.run.reasonResolved,
      'completed',
      'Task not resolved as complete'
    );
  });

  test('link valid audio loopback device', async () => {
    var task = {
      scopes: ["docker-worker:capability:device:loopbackAudio"],
      payload: {
        capabilities: {
          devices: {
            'loopbackAudio': true
          }
        },
        image: 'ubuntu:14.10',
        command: cmd(
          "ls /dev/snd",
          "test -c /dev/snd/controlC0 -a \
          -c /dev/snd/pcmC0D0c -a \
          -c /dev/snd/pcmC0D0p -a \
          -c /dev/snd/pcmC0D1c -a \
          -c /dev/snd/pcmC0D1p \
          || { echo 'Devices not found' ; exit 1; }"
        ),
        maxRunTime:         5 * 60
      }
    };

    let result = await worker.postToQueue(task);

    assert.equal(result.status.state, 'completed', 'Task state is not marked as completed');
    assert.equal(
      result.run.reasonResolved,
      'completed',
      'Task not resolved as complete'
    );
  });

  test('task failed when scopes not specified', async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
    var task = {
      payload: {
        capabilities: {
          devices: {
            'loopbackVideo': true,
            'loopbackAudio': true
          }
        },
        image: 'ubuntu:14.10',
        command: cmd(
          "ls /dev",
          "test -c /dev/video0 || { echo 'Device not found' ; exit 1; }"
        ),
        maxRunTime:         5 * 60
      }
    };

    let result = await worker.postToQueue(task);

    assert.equal(result.status.state, 'failed', 'Task state is not marked as failed');
    assert.equal(
      result.run.reasonResolved,
      'failed',
      'Task not resolved as failed'
    );

    assert.ok(
      result.log.indexOf('Insufficient scopes to attach devices') !== -1,
      'Error for insufficient scopes does not appear in the logs'
    );
  });

  test('link testdroid device', async () => {
    let server = http.createServer(app.callback());
    let testdroidUrl;
    let ip = os.networkInterfaces()['docker0'].find((networkInterface) => {
      return networkInterface.family === 'IPv4'
    })
    ip = ip.address;
    server.listen(() => {
      testdroidUrl = `http:\/\/${ip}:${server.address().port}/`;
    });

    await waitForEvent(server, 'listening');

    settings.configure({
      capacity: 15,
      deviceManagement: {
        loopbackAudio: {
          enabled: true
        },
        loopbackVideo: {
          enabled: true,
        },
        phone: {
          enabled: true,
          sims: '1',
          type: 'flame-kk',
        }
      },
      testdroid: {
        url: testdroidUrl,
        username: 'test1',
        password: 'pass'
      }
    })

    worker = new TestWorker(DockerWorker);
    await worker.launch();
    var task = {
      scopes: ["docker-worker:capability:device:phone"],
      payload: {
        capabilities: {
          devices: {
            'loopbackVideo': true,
            'phone': {
              'type': 'flame-kk',
              'sims': 1
            }
          }
        },
        image: 'ubuntu:14.10',
        command: cmd(
          "ls /dev",
          "test -c /dev/video0 || { echo 'Device not found' ; exit 1; }"
        ),
        maxRunTime:         5 * 60
      }
    };

    let result = await worker.postToQueue(task);
    server.close();

    assert.equal(result.status.state, 'completed', 'Task state is not marked as completed');
    assert.equal(
      result.run.reasonResolved,
      'completed',
      'Task not resolved as complete'
    );
  });

})
