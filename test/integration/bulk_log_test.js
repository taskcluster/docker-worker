suite('logging to artifact', function() {
  var co = require('co');
  var request = require('superagent-promise');
  var testworker = require('../post_task');
  var get = require('./helper/get');

  test('artifact logger', co(function* () {
    var result = yield testworker({
      image:          'ubuntu',
      command:        [
        '/bin/bash',
        '-c',
        'echo "first command!";' +
        'for i in {1..1000}; do echo "Hello Number $i"; done;'
      ],
      features: {
        liveLog: true,
        bulkLog: true
      },
      maxRunTime:         5 * 60
    });

    assert.ok(result.run.success, 'task success');

    // Expected junk in the log.
    var log = '';
    for (var i = 1; i <= 1000; i++) {
      log += 'Hello Number ' + i + '\r\n';
    }

    // We have to manually construct the url (it's public access) to to avoid
    // issues with the current taskcluster-client and queue implementations.
    var url = 'https://queue.taskcluster.net/v1/task/' +
              result.taskId + '/runs/' + result.runId + '/artifacts/' +
              result.artifacts['public/logs/terminal_bulk.log'].name;

    var content = yield get(url);
    assert.ok(
      content.indexOf(log) !== -1, 'bulk log contains correct number of lines'
    );

    assert.equal(
      content, result.log, 'livelog and bulk log should be identical'
    );
  }));
});
