
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
      var gc = new GarbageCollector({
        log: log,
        docker: docker,
        interval: 5
      });
      var markedContainers = []

      for (var i = 0; i < 5; i++) {
        var container = yield docker.createContainer({Image: IMAGE});
        markedContainers.push(container.id);
        gc.removeContainer(container.id);
      }

      markedContainers.forEach(function (container) {
        assert.ok(container in gc.markedContainers,
                  'Container was not found in the list of garbage ' +
                  'collected containers.')
      })


      setTimeout(function () {
        assert.ok(!(container in gc.markedContainers),
                  'Container was found in the list of garbage ' +
                  'collected containers.')
        done();
      }, 10 * 1000);
    })();
  });
  // TODO - Test remove running container
});
