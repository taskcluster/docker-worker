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
        devices: {
          'loopbackAudio': true,
          'loopbackVideo': true
        },
        image: 'ubuntu:14.10',
        command: cmd(
          "find /dev -name 'video0'"
        ),
        maxRunTime:         5 * 60
      }
    };

    let result = await worker.postToQueue(task);

    assert.equal(result.status.state, 'completed', 'Task not marked as failed');
    assert.equal(
      result.run.reasonResolved,
      'completed',
      'Task not resolved as complete'
    );
  });

  test('link valid video loopback device', async () => {
    var task = {
      payload: {
        devices: {
          'loopbackAudio': true
        },
        image: 'ubuntu:14.10',
        command: cmd(
          "find /dev/snd -name 'controlC0'"
        ),
        maxRunTime:         5 * 60
      }
    };

    let result = await worker.postToQueue(task);

    assert.equal(result.status.state, 'completed', 'Task not marked as failed');
    assert.equal(
      result.run.reasonResolved,
      'completed',
      'Task not resolved as complete'
    );
  });
})
