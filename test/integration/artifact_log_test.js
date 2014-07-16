suite('logging to artifact', function() {
  var co = require('co');
  var request = require('superagent-promise');
  var testworker = require('../testworker');

  test('artifact logger', co(function* () {
    var data = yield testworker({
      image:          'ubuntu',
      command:        [
        '/bin/bash',
        '-c',
        'echo "first command!";' +
        'for i in {1..1000}; do echo "Hello Number $i"; done;'
      ],
      features: {
        bufferLog:    true,
        azureLiveLog: false,
        artifactLog:  true
      },
      maxRunTime:         5 * 60
    });

    // Get task specific results
    var result = data.result.result;
    assert.ok(data.result.metadata.success, 'task was successful');
    assert.ok(result.logText.indexOf('first') !== -1);

    // Get the logs.json
    var logs = data.logs;
    var artifacts = data.result.artifacts;

    // Lookup in the logs map inside logs.json
    var artifact_log = logs['terminal-artifact.log'];
    assert.ok(artifact_log !== undefined);
    assert.ok(artifacts['terminal-artifact.log'] == artifact_log);

    // Fetch log
    return request.get(artifact_log).end().then(function(req) {
      // Check that it's equal to logText from buffer log
      assert.equal(req.res.text, result.logText);
    });
  }));
});
