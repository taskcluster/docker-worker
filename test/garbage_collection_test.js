
suite('garbage collection tests', function () {
  var co = require('co');
  var docker = require('../lib/docker')();
  var dockerUtils = require('dockerode-process/utils');
  var streams = require('stream');
  var createLogger = require('../lib/log');
  var GarbageCollector = require('../lib/gc');
  var IMAGE = 'taskcluster/test-ubuntu';

  var stdout = new streams.PassThrough();

  var log = createLogger({
    source: 'top', // top level logger details...
    provisionerId: 'test_provisioner',
    workerId: 'test_worker',
    workerGroup: 'test_worker_group',
    workerType: 'test_worker_type'
  });

  function assertMarkedContainers(containerId) {
    assert.ok(containerId in this.markedContainers,
              'Container was not found in the list of garbage ' +
              'collected containers.');
  };

  function assertRemovedContainer(testMarkedContainers, containerId) {
    assert.ok(!(containerId in this.markedContainers),
              'Container was found in the list of garbage ' +
              'collected containers.');
    var idx = testMarkedContainers.indexOf(containerId);
    testMarkedContainers.splice(idx, 1);
  };

  function removalError(error) {
    throw error;
  };

  function sweepStopped(testMarkedContainers, done) {
    if (testMarkedContainers.length === 0) {
      clearTimeout(this.sweepTimeoutId);
      done();
    }
  };

  setup(co(function* () {
    yield new Promise(function(accept, reject) {
      // pull the image (or use on in the cache and output status in stdout)
      var pullStream =
        dockerUtils.pullImageIfMissing(docker, IMAGE);

      // pipe the pull stream into stdout but don't end
      pullStream.pipe(stdout, { end: false });

      pullStream.once('error', reject);
      pullStream.once('end', function() {
        pullStream.removeListener('error', reject);
        accept();
      }.bind(this));
    }.bind(this));
  }));

  test('remove containers', function (done) {
    co(function* () {
      var testMarkedContainers = [];

      var gc = new GarbageCollector({
        log: log,
        docker: docker,
        interval: 1 * 1000
      });

      gc.on('gc:container:marked', assertMarkedContainers);
      gc.on('gc:container:removed', assertRemovedContainer.bind(gc, testMarkedContainers));
      gc.on('gc:error', removalError);
      gc.on('gc:sweep:stop', sweepStopped.bind(gc, testMarkedContainers, done));

      for (var i = 0; i < 2; i++) {
        var container = yield docker.createContainer({Image: IMAGE});
        testMarkedContainers.push(container.id);
        gc.removeContainer(container.id);
      }
    })();
  });

  test('remove running container', function(done) {
    co(function* () {
      var gc = new GarbageCollector({
        log: log,
        docker: docker,
        interval: 2 * 1000
      });

      var container = yield docker.createContainer({Image: IMAGE, Cmd: '/bin/bash && sleep 60'});
      var testMarkedContainers = [container.id];
      gc.removeContainer(container.id);

      gc.on('gc:container:marked', assertMarkedContainers);
      gc.on('gc:container:removed', assertRemovedContainer.bind(gc, testMarkedContainers));
      gc.on('gc:error', removalError);
      gc.on('gc:sweep:stop', sweepStopped.bind(gc, testMarkedContainers, done));

    })();
  });

  test('container removal retry limit exceeded', function(done) {
    co(function* () {
      var gc = new GarbageCollector({
        log: log,
        docker: docker,
        interval: 2 * 1000
      });

      var retryLimitEncountered = false;
      var cleanupComplete = false;

      var container = yield docker.createContainer({Image: IMAGE});
      gc.removeContainer(container.id);
      gc.markedContainers[container.id] = 0;

      gc.on('gc:container:marked', assertMarkedContainers);
      gc.on('gc:container:removed', function () {
        if (retryLimitEncountered) {
          cleanupComplete = true;
        }
      });
      gc.on('gc:error', function(error) {
        assert.ok(error.error === 'Retry limit exceeded',
                  'Error message does not match \'Retry limit exceeded\'');
        assert.ok(!(error.container in this.markedContainers),
                  'Container has exceeded the retry limit but has not been ' +
                  'removed from the list of marked containers.');
        assert.ok(this.ignoredContainers.indexOf(error.container) !== -1,
                  'Container has exceeded the retry limit but has not been ' +
                  'added to the list of ignored containers');
        retryLimitEncountered = true;
      });

      gc.on('gc:sweep:stop', function () {
        if (!cleanupComplete) {
          assert.ok(retryLimitEncountered,
                    'Retry limit has not been encountered for the container');
          gc.removeContainer(container.id);
        } else {
          clearTimeout(this.sweepTimeoutId);
          done();
        }
      });
    })();
  });
});
