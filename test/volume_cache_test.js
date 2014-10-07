suite('volume cache test', function () {
  var VolumeCache = require('../lib/volume_cache');
  var createLogger = require('../lib/log');
  var docker = require('../lib/docker')();
  var waitForEvent = require('../lib/wait_for_event');
  var fs = require('fs');
  var path = require('path');
  var mkdirp = require('mkdirp');
  var rmrf = require('rimraf');
  var co = require('co');
  var pullImage = require('../lib/pull_image_to_stream');
  var cmd = require('./integration/helper/cmd');

  // Location on the machine running the test where the cache will live
  var localCacheDir = process.env.DOCKER_WORKER_CACHE_DIR || '/var/cache';

  var log = createLogger({
    source: 'top',
    provisionerId: 'test_provisioner',
    workerId: 'test_worker',
    workerGroup: 'test_worker_group',
    workerType: 'test_worker_type'
  });

  var stats = {
    increment: function(stat) { return; }
  };

  var IMAGE = 'taskcluster/test-ubuntu';

  setup(co(function* () {
    yield pullImage(docker, IMAGE, process.stdout);
  }));

  test('cache directories created', co(function* () {
    var cache = new VolumeCache({
      rootCachePath: localCacheDir,
      log: log,
      stats: stats
    });

    var cacheName = 'tmp-obj-dir-' + Date.now().toString();
    var fullPath = path.join(localCacheDir, cacheName);

    if (fs.existsSync(fullPath)) {
      rmrf.sync(fullPath);
    }

    var instance1 = yield cache.get(cacheName);
    var instance2 = yield cache.get(cacheName);
    var instance3 = yield cache.get(cacheName);

    assert.ok(fs.existsSync(instance1.path));
    assert.ok(fs.existsSync(instance2.path));
    assert.ok(fs.existsSync(instance3.path));
    assert.ok(instance1.key !== instance2.key);
    assert.ok(instance2.key !== instance3.key);
    assert.ok(instance1.path !== instance2.path);
    assert.ok(instance2.path !== instance3.path);

    // Release clame on cached volume
    yield cache.release(instance2.key);

    // Should reclaim cache directory path created by instance2
    var instance4 = yield cache.get(cacheName);

    assert.ok(instance2.key !== instance4.key);
    assert.ok(instance2.path === instance4.path);

    if(fs.existsSync(fullPath)) {
      rmrf.sync(fullPath);
    }
  }));

  test('cache directory mounted in container', co(function* () {
    // Test is currently setup using container volumes exposed via samba using
    // boot2docker

    var cacheName = 'tmp-obj-dir-' + Date.now().toString();
    // Location on the docker VM that the cache will exists and is expose via
    // samba
    var hostCacheDir = '/docker_test_data';

    var cache = new VolumeCache({
      rootCachePath: localCacheDir,
      log: log,
      stats: stats
    });

    var localCachePath = path.join(localCacheDir, cacheName);

    if (fs.existsSync(localCachePath)) {
      rmrf.sync(localCachePath);
    }

    var cacheInstance = yield cache.get(cacheName);

    var c = cmd(
      'echo "foo" > /docker_cache/tmp-obj-dir/blah.txt'
    );

    var createConfig = {
      Image: IMAGE,
      Cmd: c,
      AttachStdin:false,
      AttachStdout:true,
      AttachStderr:true,
      Tty: true
    };
    var hostObjPath = path.join(
        hostCacheDir,
        cacheName,
        cacheInstance.key.split('::')[1]
    );
    var create = yield docker.createContainer(createConfig);

    container = docker.getContainer(create.id);
    var stream = yield container.attach({stream: true, stdout: true, stderr: true});
    stream.pipe(process.stdout);

    var binds = hostObjPath + ':/docker_cache/tmp-obj-dir/';

    var startConfig = {
      Binds: binds,
    };

    yield container.start(startConfig);

    assert.ok(fs.existsSync(path.join(cacheInstance.path, 'blah.txt')));

    if (fs.existsSync(localCachePath)) {
      rmrf.sync(localCachePath);
    }
  }));
});
