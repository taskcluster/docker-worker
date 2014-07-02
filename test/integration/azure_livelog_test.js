suite('azure logging', function() {
  if (!process.env.AZURE_STORAGE_ACCOUNT) {
    test.skip(
      'azure logging test disabled env: AZURE_STORAGE_ACCOUNT missing'
    );
    return;
  }

  var co = require('co');
  var request = require('superagent-promise');
  var testworker = require('../testworker');

  test('azure logger', co(function* () {
    var data = yield testworker({
      image:          'ubuntu',
      command:        [
        '/bin/bash',
        '-c',
        'echo "first command!"; ' +
        'for i in {1..1000}; do echo "Hello Number $i"; done;'
      ],
      features: {
        bufferLog:    true,
        azureLiveLog: true
      },
      maxRunTime:         5 * 60
    });

    // Get task specific results
    var result = data.result.result;
    assert.equal(result.exitCode, 0);
    assert.ok(result.logText.indexOf('first') !== -1);

    // Get the logs.json
    var logs = data.logs;

    // Lookup in the logs map inside logs.json
    var azure_log = logs['terminal.log'];
    assert.ok(azure_log !== undefined);

    // Fetch log from azure
    var res = yield request.get(azure_log).end();
    // Check that it's equal to logText from buffer log
    assert.equal(res.text, result.logText);
  }));
});
