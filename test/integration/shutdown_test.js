suite('Shutdown on idle', function() {
  var co = require('co');
  var waitForEvent = require('../../lib/wait_for_event');
  var settings = require('../settings');
  var cmd = require('./helper/cmd');

  var DockerWorker = require('../dockerworker');
  var TestWorker = require('../testworker');

  // Ensure we don't leave behind our test configurations.
  teardown(settings.cleanup);

  var worker;
  setup(co(function * () {
    settings.billingCycleInterval(40);
    settings.configure({
      shutdown: true,
      shutdownSecondsStart: 10,
      shutdownSecondsStop: 2
    });

    worker = new TestWorker(DockerWorker);
    yield worker.launch();
  }));

  test('idle with timer shutdown', co(function *() {
    settings.billingCycleUptime(469);
    var res = yield {
      post: worker.post({
        image: 'ubuntu',
        command: cmd(
          'echo "Okay, this is now done"'
        ),
        maxRunTime: 60 * 60
      }),
      pendingShutdown: waitForEvent(worker, 'pending shutdown'),
      exit: waitForEvent(worker, 'exit')
    };
    assert.equal(res.pendingShutdown.time, 1);
  }));

  test('idle immediate shutdown', co(function *() {
    settings.billingCycleUptime(75);
    var res = yield {
      post: worker.post({
        image: 'ubuntu',
        command: cmd(
          'echo "Okay, this is now done"'
        ),
        maxRunTime: 60 * 60
      }),
      pendingShutdown: waitForEvent(worker, 'pending shutdown'),
      exit: waitForEvent(worker, 'exit')
    };
    assert.equal(res.pendingShutdown.time, 0);
  }));

  test('idle then working', co(function *() {
    settings.billingCycleUptime(39);
    var idling = yield {
      post: worker.post({
        image: 'ubuntu',
        command: cmd(
          'echo "Okay, this is now done"'
        ),
        maxRunTime: 60 * 60
      }),
      pendingShutdown: waitForEvent(worker, 'pending shutdown')
    };
    assert.equal(idling.pendingShutdown.time, 31);

    var working = yield {
      create: worker.createGraph({
        image: 'ubuntu',
        command: cmd(
          'echo "Okay, this is now done"'
        ),
        maxRunTime: 60 * 60
      }),
      canceled: waitForEvent(worker, 'cancel pending shutdown')
    };
    assert.ok(working.canceled, 'cancel event fired');
    yield worker.terminate();
  }));
});
