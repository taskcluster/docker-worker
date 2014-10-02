suite('container volume cache tests', function () {
  var co = require('co');
  var cmd = require('./helper/cmd');
  var fs = require('fs');
  var rmrf = require('rimraf');
  var path = require('path');
  var testworker = require('../post_task');

  var cacheDir = process.env.DOCKER_WORKER_CACHE_DIR || '/var/cache';

  test('mount cached folder in docker worker', co(function* () {
    var cacheName = 'tmp-obj-dir-' + Date.now().toString();
    var fullCacheDir = path.join(cacheDir, cacheName);

    var task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'echo "foo" > /tmp-obj-dir/foo.txt'
        ),
        features: {
          // No need to actually issue live logging...
          localLiveLog: false
        },
        cache: {},
        maxRunTime:         5 * 60
      }
    };

    task.payload.cache[cacheName] = '/tmp-obj-dir';

    var result = yield testworker(task);

    // Get task specific results
    assert.ok(result.run.success, 'task was successful');

    var objDir = fs.readdirSync(fullCacheDir);
    assert.ok(fs.existsSync(path.join(fullCacheDir, objDir[0], 'foo.txt')));

    if (fs.existsSync(fullCacheDir)) {
      rmrf.sync(fullCacheDir);
    }
  }));
});
