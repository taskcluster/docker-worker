suite('stop request', function() {
  var co = require('co');
  var testworker = require('../testworker');

  test('timing metrics', co(function* () {
    var data = yield testworker({
      image:            'ubuntu',
      command:          ['/bin/bash', '-c', 'echo "first command!"'],
      features: {
        bufferLog:      false,
        azureLiveLog:   false
      },
      maxRunTime:         5 * 60
    });

    // Get task specific results
    var result = data.result.result;
    assert.equal(result.exitCode, 0);
    assert.ok(result.startTimestamp, 'has start time');
    assert.ok(result.stopTimestamp, 'has stop time');
  }));
});
