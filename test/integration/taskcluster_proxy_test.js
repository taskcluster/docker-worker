suite('taskcluster proxy', function() {
  var co = require('co');
  var request = require('superagent-promise');
  var testworker = require('../post_task');
  var queue = new (require('taskcluster-client').Queue);
  var cmd = require('./helper/cmd');

  function* get(url) {
    return (yield request.get(url).end()).body;
  }

  test('issue a request to taskcluster via the proxy', co(function* () {
    var expected = 'is woot';
    var data = yield testworker({
      image: 'centos:latest',
      command: cmd(
        'curl taskcluster/queue/v1/task/$TASK_ID/status > /status.json'
      ),
      features: {
        bufferLog: true,
        azureLiveLog: false
      },
      artifacts: {
        'status.json': '/status.json',
      },
      maxRunTime:         5 * 60
    });

    // Get task specific results
    var result = data.result.result;
    var statusFromTask = yield get(data.result.artifacts['status.json'].url);
    var statusFromQueue = yield queue.getTaskStatus(data.taskId);

    assert.deepEqual(
      statusFromTask.status.taskId,
      statusFromQueue.status.taskId
    );
  }));
});
