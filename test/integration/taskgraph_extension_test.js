suite('Extend Task Graph', function() {
  var co = require('co');
  var testworker = require('../testworker');
  var get = require('./helper/get');
  var cmd = require('./helper/cmd');

  var scheduler = new (require('taskcluster-client').Scheduler);
  var queue = new (require('taskcluster-client').Queue);

  var Task = require('taskcluster-task-factory/task');
  var EXTENSION_LABEL = 'test_task_extension';

  var graphTask = Task.create({
    workerType: '{{workerType}}',
    provisionerId: '{{provisionerId}}',
    metadata: {
      owner: 'test@localhost.local'
    },
    payload: {
      image: 'ubuntu',
      command: cmd('ls', '/bin/bash'),
      features: {},
      artifacts: {},
      maxRunTime: 5 * 60
    }
  });

  var graph = {
    version: '0.2.0',
    params: {},
    tasks: [{
      label: EXTENSION_LABEL,
      requires: [],
      reruns: 0,
      task: graphTask
    }]
  };

  test('successfully extend graph', co(function* () {
    var json = JSON.stringify(graph);
    var data = yield testworker({
      image: 'ubuntu',
      command: cmd(
        'echo \'' + json + '\' > /graph.json'
      ),
      features: {},
      artifacts: {},
      extendTaskGraph: '/graph.json',
      maxRunTime: 5 * 60
    });

    var result = data.result.result;
    var task = yield queue.getTask(data.taskId);

    var taskGraphInfo =
      yield scheduler.inspectTaskGraph(task.metadata.taskGraphId);

    assert.equal(taskGraphInfo.status.state, 'running');
    assert.ok(taskGraphInfo.tasks[EXTENSION_LABEL], 'task graph was extended');

    var extensionTask =
      yield queue.getTask(taskGraphInfo.tasks[EXTENSION_LABEL].taskId);

    assert.deepEqual(extensionTask.payload, graphTask.payload);
  }));
});
