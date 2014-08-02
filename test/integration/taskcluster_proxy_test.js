suite('taskcluster proxy', function() {
  var co = require('co');
  var request = require('superagent-promise');
  var testworker = require('../post_task');
  var queue = new (require('taskcluster-client').Queue);
  var cmd = require('./helper/cmd');
  var expires = require('./helper/expires')

  test('issue a request to taskcluster via the proxy', co(function* () {
    var expected = 'is woot';
    var payload = {
      kind: 'redirect',
      expires: expires().toJSON(),
      contentType: 'text/html',
      url: 'https://mozilla.com'
    };

    var result = yield testworker({
      scopes: ['queue:put:artifact:*'],
      payload: {
        image: 'centos:latest',
        artifacts: {},
        command: cmd(
          'curl -X POST ' +
          '-H "Content-Type: application/json" ' +
          '--data \'' + JSON.stringify(payload) + '\' ' +
          'taskcluster/queue/v1/task/$TASK_ID/runs/$RUN_ID/artifacts/custom'
        ),
        maxRunTime: 5 * 60
      }
    });

    assert.ok(result.run.success, 'run was successful');
    assert.ok(result.artifacts['custom'], 'custom artifact is available');
    assert.equal(result.artifacts['custom'].kind, 'redirect');
  }));
});
