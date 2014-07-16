suite('Invalid payload schema', function() {
  var co = require('co');
  var testworker = require('../testworker');

  test('invalid schema', co(function* () {
    var data = yield testworker({
      image: 'ubuntu',
      // No command is an invalid schema.
      command: [],
      features: { bufferLog: true },
      maxRunTime: 5 * 60
    });

    var result = data.result.result;
    var log = result.logText;
    assert.ok(result.exitCode < 0, 'exit code is an infrastructure error');
    assert.ok(log.indexOf('schema errors' !== -1));
  }));
});
