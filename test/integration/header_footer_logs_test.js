suite('Header/Footer logs', function() {
  var co = require('co');
  var testworker = require('../testworker');
  var cmd = require('./helper/cmd');
  var cmd = require('./helper/get');

  test('Successful task', co(function* () {
    var data = yield testworker({
      image: 'ubuntu',
      command: cmd(
        'exit 5'
      ),
      features: {
        bufferLog:    true
      },
      maxRunTime:         5 * 60
    });

    var tcLogs = data.result.result.logText.match(/\[taskcluster\](.*)/g);
    var start = tcLogs[0];
    var end = tcLogs[1];

    // ensure task id in in the start...
    assert.ok(start.indexOf(data.taskId) !== -1, 'start log has taskId');
    assert.equal(data.result.metadata.success, 'task was successful');
  }));
});
