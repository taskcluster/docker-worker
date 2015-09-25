suite('pull image', function() {
  var assert = require('assert');
  var co = require('co');
  var testworker = require('../post_task');
  var docker = require('../../lib/docker')();
  var dockerUtils = require('dockerode-process/utils');
  var cmd = require('./helper/cmd');
  var slugid = require('slugid');
  var expires = require('./helper/expires');

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

  test('ensure public indexed image can be pulled', async () => {
    let namespace = `garbage.docker-worker-tests.docker-images.${slugid.v4()}`;
    let result = await testworker({
      payload: {
        image: 'taskcluster/dind-test:v1',
        routes: `index.${namespace}`,
        command: cmd(
          'mkdir artifacts',
          'docker pull gliderlabs/alpine:latest',
          'docker save gliderlabs/alpine:latest > /artifacts/image.tar'
        ),
        features: {
          dind: true
        },
        maxRunTime: 5 * 60,
        artifacts: {
          'public/image.tar': {
            type: 'file',
            expires: expires(),
            path: '/artifacts/image.tar'
          }
        }
      }
    });

    try {
      assert.equal(result.run.state, 'completed', 'Task to create indexed image failed.');
    } catch(e) {
      console.log(result.log);
      throw e;
    }

    let image = {
      namespace: namespace,
      path: 'public/image.tar'
    };

    //await dockerUtils.removeImageIfExists(docker, image);
    result = await testworker({
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

