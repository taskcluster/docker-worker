suite('Task duration stats', function() {
  var co = require('co');
  var testworker = require('../post_task');
  var cmd = require('./helper/cmd');

  test('1s long task minimum', co(function* () {
    var data = yield testworker({
      image: 'ubuntu',
      command: cmd(
        'sleep 1'
      ),
      features: {
        bufferLog:    true,
        azureLiveLog: false
      },
      maxRunTime:         5 * 60
    });

    var stats = data.result.statistics;
    var duration = new Date(stats.finished) - new Date(stats.started);

    assert.ok(duration > 1000, 'Duration should exist and be greater then 1s');
  }));
});
