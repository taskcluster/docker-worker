suite('stop request', function() {
  var testworker = require('../testworker');

  test('timing metrics', function() {
    return testworker.submitTaskAndGetResults({
      image:            'ubuntu',
      command:          ['/bin/bash', '-c', 'echo "first command!"'],
      features: {
        bufferLog:      false,
        azureLivelog:   false
      }
    }).then(function(resultStructure) {
        var start = resultStructure.result.start;
        var stop = resultStructure.result.stop;

        assert.equal(resultStructure.result.exitCode, 0);
        assert.ok(resultStructure.result.startTimestamp, 'has start time');
        assert.ok(resultStructure.result.stopTimestamp, 'has stop time');
      }
    );
  });
});

