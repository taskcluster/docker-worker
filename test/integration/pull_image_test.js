suite('pull image', function() {
  var assert = require('assert');
  var co = require('co');
  var testworker = require('../post_task');
  var docker = require('../../lib/docker')();
  var dockerUtils = require('dockerode-process/utils');
  var cmd = require('./helper/cmd');

  test('ensure docker image can be pulled', co(function* () {
    let image = 'gliderlabs/alpine:latest';
    yield dockerUtils.removeImageIfExists(docker, image);
    var result = yield testworker({
      payload: {
        image: image,
        command: cmd('ls'),
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
  }));

  test('ensure indexed image can be pulled', async () => {
    let image = {
      namespace: 'public.garndt.garbage.test-image.v1',
      path: 'public/image.tar'
    };

    //await dockerUtils.removeImageIfExists(docker, image);
    let result = await testworker({
      payload: {
        image: image,
        command: cmd('ls /bin'),
        maxRunTime: 5 * 60
      }
    });

    console.log(result.log);
    assert.ok(result.log.includes('busybox'), 'Does not appear to be the correct image with busybox');
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
  });

  test('Task marked as failed if image cannot be pulled', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'ubuntu:99.99',
        command: cmd('ls'),
        maxRunTime: 5 * 60
      }
    });
    assert.equal(result.run.state, 'failed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'failed', 'task should be successful');
  }));
});

