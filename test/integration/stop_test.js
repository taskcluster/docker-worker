suite('stop request', function() {
  var co = require('co');
  var testworker = require('../post_task');

  test('timing metrics', co(function* () {
    var data = yield testworker({
      image:            'ubuntu',
      command:          ['/bin/bash', '-c', 'sleep 1'],
      features: {
        bufferLog:      false,
        azureLiveLog:   false
      },
      maxRunTime:         5 * 60
    });

    var result = data.result;

    var start = new Date(result.statistics.started);
    var end = new Date(result.statistics.finished);

    assert.ok(
      (end.valueOf() - start.valueOf()) > 1000,
      'start/finish stats are at least as long as the container run.'
    );
  }));
});
