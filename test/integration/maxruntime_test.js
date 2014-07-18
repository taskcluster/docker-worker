suite('worker timeouts', function() {
  var co = require('co');
  var testworker = require('../post_task');

  test('worker sleep more than maxRunTime', co(function* () {
    var data = yield testworker({
      image:          'ubuntu',
      command:        [
        '/bin/bash', '-c', 'echo "Hello"; sleep 20; echo "done";'
      ],
      features: {
        bufferLog:    true,
        azureLiveLog: false
      },
      maxRunTime:         10
    });
    // Get task specific results
    var result = data.result.result;

    assert.ok(!data.result.metadata.success, 'task was not successful');
    assert.ok(result.exitCode != 0);
    assert.ok(result.logText.indexOf('Hello') !== -1);
    assert.ok(result.logText.indexOf('done') === -1);
    assert.ok(
      result.logText.indexOf('[taskcluster] Task timeout') !== -1,
      'Task should contain logs about timeout'
    );
  }));
});
