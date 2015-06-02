
import assert from 'assert';
import DockerWorker from '../dockerworker';
import TestWorker from '../testworker';

suite('use dind-service', () => {
  let worker;
  setup(async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });

  teardown(async () => {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
  });

  test('run docker in docker', async () => {
    let result = await worker.postToQueue({
      payload: {
        image: 'jonasfj/dind-test:v1',
        command: [''],
        features: {
          bufferLog: false,
          azureLiveLog: false,
          dind: true
        },
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successfull');
    assert.equal(result.run.reasonResolved, 'completed',
                 'task should be successfull');
    assert.ok(result.log.indexOf('BusyBox is a multi-call binary') !== -1,
              'Expected to see busybox --help message');
  });
});

