suite('use dind-service', () => {
  var testworker = require('../post_task');
  var co = require('co');

  test('run docker in docker', async () => {
    let result = await co(testworker({
      payload: {
        image:          'jonasfj/dind-test:v1',
        command:        [''],
        features: {
          bufferLog:    true,
          azureLiveLog: false,
          dind:         true
        },
        maxRunTime: 5 * 60
      }
    }))

    assert.equal(result.run.state, 'completed', 'task should be successfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successfull');
    assert.ok(result.log.indexOf('BusyBox is a multi-call binary') !== -1,
              'Expected to see busybox --help message');
  });
});

