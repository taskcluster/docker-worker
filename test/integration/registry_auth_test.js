suite('Docker custom private registry', function() {
  var co = require('co');
  var waitForEvent = require('../../lib/wait_for_event');
  var settings = require('../settings');
  var cmd = require('./helper/cmd');
  var slugid = require('slugid');
  var proxy = require('./helper/proxy');
  var docker = require('../../lib/docker')();

  var DockerWorker = require('../dockerworker');
  var TestWorker = require('../testworker');

  var REGISTRY = 'registry.hub.docker.com';

  // Ensure we don't leave behind our test configurations.
  teardown(settings.cleanup);

  var registryProxy;
  var credentials = { username: 'user', password: 'pass' };
  suiteSetup(co(function* () {
    registryProxy = yield proxy(credentials);
  }));

  suiteTeardown(co(function* () {
    yield registryProxy.close();
  }));

  var worker;
  setup(co(function * () {
    // For interfacing with the docker registry.
    worker = new TestWorker(DockerWorker, slugid.v4(), slugid.v4());
  }));

  teardown(co(function* () {
    yield worker.terminate();
  }));

  test('success', co(function* () {
    var imageName = registryProxy.imageName('lightsofapollo/busybox');
    var registry = {};
    registry[registryProxy.imageName('')] = credentials;
    settings.configure({ registry: registry });

    yield worker.launch();

    var result = yield worker.postToQueue({
      payload: {
        image: imageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60
      }
    });

    assert.ok(result.run.success, 'auth download works');
    assert.ok(result.log.indexOf(imageName) !== '-1', 'correct image name');
  }));

  test('failed', co(function* () {
    var imageName = registryProxy.imageName('lightsofapollo/busybox');

    // Ensure this credential request fails...
    var registry = {};
    registry[registryProxy.imageName('')] = {
      username: 'fail', password: 'fail' 
    };
    settings.configure({ registry: registry });

    yield worker.launch();

    var result = yield worker.postToQueue({
      payload: {
        image: imageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60
      }
    });
    assert.ok(!result.run.success, 'auth download works');
    assert.ok(result.log.indexOf(imageName) !== '-1', 'correct image name');
  }));

});
