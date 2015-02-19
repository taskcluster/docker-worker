suite('Capacity', function() {
  var co = require('co');
  var waitForEvent = require('../../lib/wait_for_event');
  var settings = require('../settings');
  var cmd = require('./helper/cmd');

  var DockerWorker = require('../dockerworker');
  var TestWorker = require('../testworker');

  var CAPACITY = 10;

  var worker;
  setup(co(function * () {
    settings.configure({
      capacity: CAPACITY
    });

    worker = new TestWorker(DockerWorker);
    yield worker.launch();
  }));

  teardown(co(function* () {
    yield worker.terminate();
    settings.cleanup();
  }));

  test(CAPACITY + ' tasks in parallel', co(function* () {
    var sleep = 2;
    var tasks = [];

    for (var i = 0; i < CAPACITY; i++) {
      tasks.push(worker.postToQueue({
        payload: {
          features: {
            localLiveLog: false
          },
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            'sleep ' + sleep
          ),
          maxRunTime: 60 * 60
        }
      }));
    }

    // The logic here is a little weak but the idea is if run in parallel the
    // total runtime should be _less_ then sleep * CAPACITY even with overhead.
    var start = Date.now();
    var results = yield tasks;
    var end = (Date.now() - start) / 1000;

    assert.equal(results.length, CAPACITY, 'all 5 tasks must have completed');
    results.forEach(function(taskRes) {
      assert.equal(taskRes.run.state, 'completed');
      assert.equal(taskRes.run.reasonResolved, 'completed');
    });
    assert.ok(end < (sleep * CAPACITY), 'tasks ran in parallel');
  }));
});
