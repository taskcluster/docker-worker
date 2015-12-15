suite('TaskListener.coalesceClaim', function() {
  var assert = require('assert');
  var TaskListener = require('../lib/task_listener');
  var fakeLog = require('debug')('fakeRuntime.log');
  var listener;
  var claimTaskResponses, coalescerResponses, coalescerCalls;
  var CO_URL = "http://coalesc.er/";

  class TestTaskListener extends TaskListener {
    constructor(runtime) {
      this.runtime = runtime;
      // don't initialize anything else
    }
  }

  setup(function() {
    claimTaskResponses = {};
    coalescerResponses = {};
    coalescerCalls = [];

    var fakeRuntime = {
      log: fakeLog,
      workerId: 'wkri',
      workerGroup: 'wkrg',
      queue: {
        claimTask: async function(taskId, runId, claimConfig) {
          assert.equal(claimConfig.workerId, 'wkri');
          assert.equal(claimConfig.workerGroup, 'wkrg');

          let resp = claimTaskResponses[taskId];
          if (resp) {
            return resp;
          }

          let err = new Error("uhoh");
          err.statusCode = 409;
          throw err;
        },
      },
    };

    listener = new TestTaskListener(fakeRuntime);

    // fake out the fetch
    listener.fetchCoalescerTasks = async function(url) {
      if (!url.startsWith(CO_URL)) {
        throw new Error("Bad URL");
      }
      let key = url.substr(CO_URL.length);
      coalescerCalls.push(key);
      return coalescerResponses[key] || [];
    };
  });

  var makeTask = function(coalescer, routes) {
    return {
      routes,
      payload: {
        coalescer,
      },
    };
  };

  var makeClaim = function(taskId, runId, task) {
    return {
      status: { taskId: taskId },
      runId,
      task,
    }
  };

  test("coalescing a claim without a coalescer yields that claim",
       async function() {
    var claim = makeClaim('fakeTask', 1, makeTask(null, []));
    assert.deepEqual(await listener.coalesceClaim(claim), [claim]);
    assert.deepEqual(coalescerCalls, []);
  });

  test("coalescing a claim without a coalescer.url yields that claim",
       async function() {
    var claim = makeClaim('fakeTask', 1, makeTask({}, []));
    assert.deepEqual(await listener.coalesceClaim(claim), [claim]);
    assert.deepEqual(coalescerCalls, []);
  });

  test("coalescing a claim with a coalescer but no matching routes yields that claim",
       async function() {
    var task = makeTask({url: CO_URL}, ['foo.bar']);
    var claim = makeClaim('fakeTask', 1, task);
    assert.deepEqual(await listener.coalesceClaim(claim), [claim]);
    assert.deepEqual(coalescerCalls, []);
  });

  test("coalescing a claim with a coalescer but two matching routes yields that claim",
       async function() {
    var task = makeTask({url: CO_URL}, ['coalescer.v1.a', 'coalescer.v1.b']);
    var claim = makeClaim('fakeTask', 1, task);
    assert.deepEqual(await listener.coalesceClaim(claim), [claim]);
    assert.deepEqual(coalescerCalls, []);
  });

  test("coalescing a claim with a coalescer and one route calls the coalescer",
       async function() {
    var task = makeTask({url: CO_URL}, ['coalescer.v1.a']);
    var claim = makeClaim('fakeTask', 1, task);
    assert.deepEqual(await listener.coalesceClaim(claim), [claim]);
    assert.deepEqual(coalescerCalls, ['a']);
  });

  test("coalescing a claim the coalescer knows about claims those tasks too, in order",
       async function() {
    coalescerResponses['a'] = ['cTask1', 'fakeTask', 'cTask2']
    claimTaskResponses['cTask1'] = {status: {taskId: 'cTask1'}, runId: 0}
    claimTaskResponses['cTask2'] = {status: {taskId: 'cTask2'}, runId: 0}
    var task = makeTask({url: CO_URL}, ['coalescer.v1.a']);
    var claim = makeClaim('fakeTask', 0, task);
    var claims = await listener.coalesceClaim(claim);
    var claimedTasks = claims.map(c => [c.status.taskId, c.runId]);
    assert.deepEqual(claimedTasks, [['cTask1', 0], ['fakeTask', 0], ['cTask2', 0]]);
    assert.deepEqual(coalescerCalls, ['a']);
  });

  test("an error in claiming the secondary claim just omits it",
       async function() {
    coalescerResponses['a'] = ['cTask1', 'fakeTask', 'cTask2']
    claimTaskResponses['cTask1'] = {status: {taskId: 'cTask1'}, runId: 0}
    var task = makeTask({url: CO_URL}, ['coalescer.v1.a']);
    var claim = makeClaim('fakeTask', 0, task);
    var claims = await listener.coalesceClaim(claim);
    var claimedTasks = claims.map(c => [c.status.taskId, c.runId]);
    assert.deepEqual(claimedTasks, [['cTask1', 0], ['fakeTask', 0]]);
    assert.deepEqual(coalescerCalls, ['a']);
  });
});
