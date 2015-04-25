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
              'ls -R /dev'
            ),
            maxRunTime:         5 * 60
      }
    };

    let result = await worker.postToQueue(task);
    console.log(result.log);
  });
})
