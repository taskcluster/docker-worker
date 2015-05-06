import TestWorker from '../testworker';
import DockerWorker from '../dockerworker';
import cmd from './helper/cmd';

suite('device linking within containers', () => {

  let worker;

  setup(async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });

  teardown(async() => {
    await worker.terminate();
  });

  test('link valid video loopback device', async () => {
    var task = {
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
})
