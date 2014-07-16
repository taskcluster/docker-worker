suite('setting env variables', function() {
  var co = require('co');
  var testworker = require('../testworker');

  test('echo env variable', co(function* () {
    var expected = 'is woot';
    var data = yield testworker({
      image:          'ubuntu',
      env:            { WOOTBAR: expected },
      command:        ['/bin/bash', '-c', 'echo $WOOTBAR'],
      features: {
        bufferLog:    true,
        azureLiveLog: false
      },
      maxRunTime:         5 * 60
    });

    // Get task specific results
    var result = data.result.result;

    assert.equal(data.result.metadata.success, 'task was successful');
    assert.ok(result.logText.indexOf(expected) !== -1);
  }));
});

