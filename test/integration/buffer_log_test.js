suite('buffer log test', function() {
  var co = require('co');
  var testworker = require('../testworker');

  test('simple echo', co(function* () {
    var data = yield testworker({
      image:          'ubuntu',
      command:        ['/bin/bash', '-c', 'echo "first command!"'],
      features: {
        bufferLog:    true,
        azureLiveLog: false
      },
      maxRunTime:         5 * 60
    });

    // Get task specific results
    var result = data.result.result;
    assert.equal(result.exitCode, 0);
    assert.ok(data.result.metadata.success, 'task was successful');
    assert.ok(result.logText.indexOf('first') !== -1);
  }));
});
