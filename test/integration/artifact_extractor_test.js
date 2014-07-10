suite('artifact extration tests', function() {
  var co = require('co');
  var get = require('./helper/get');
  var cmd = require('./helper/cmd');
  var testworker = require('../testworker');

  test('extract artifact', co(function* () {
    var data = yield testworker({
      image: 'ubuntu',
      command: cmd(
        'mkdir /artifacts/',
        'echo "xfoo" > /artifacts/xfoo.txt',
        'echo "bar" > /artifacts/bar.txt',
        'ls /artifacts'
      ),
      features: {
        bufferLog: true,
        azureLiveLog: false,
        extractArtifacts: true
      },
      artifacts: {
        // name: source
        'xfoo': '/artifacts/xfoo.txt',
        'bar': '/artifacts/bar.txt'
      },
      maxRunTime:         5 * 60
    });
    // Get task specific results
    var result = data.result.result;
    var artifacts = result.artifacts;
    assert.equal(result.exitCode, 0);

    assert.deepEqual(
      Object.keys(artifacts).sort(), ['xfoo', 'bar'].sort()
    );

    var bodies = yield {
      xfoo: get(artifacts.xfoo.url),
      bar: get(artifacts.bar.url),
    };

    assert.equal(bodies.xfoo.trim(), 'xfoo');
    assert.equal(bodies.bar.trim(), 'bar');
  }));

  test('extract missing artifact', co(function*() {
    var data = yield testworker({
      image: 'ubuntu',
      command: cmd(
        'echo "the user is:" > /username.txt',
        'whoami >> /username.txt',
        'echo "Okay, this is now done"'
      ),
      features: {
        bufferLog: true,
        azureLivelog: false,
        extractArtifacts: true
      },
      artifacts: {
        // Name -> Source
        'my-missing.txt': 'this-file-is-missing.txt'
      },
      maxRunTime:         5 * 60
    });

    // Get task specific results
    var result = data.result.result;
    var log = result.logText;

    assert.ok(
      log.indexOf('"this-file-is-missing.txt"') !== -1,
      'Missing path is noted in the logs'
    );

    assert.equal(result.exitCode, 0);
    assert.ok(result.artifacts['my-missing.txt'])
    assert.ok(
      result.artifacts['my-missing.txt'].error,
      'An error is noted for the artifact'
    );
  }));

  test('extract artifacts and missing artifact', co(function* () {
    var data = yield testworker({
      image: 'ubuntu',
      command: cmd(
        'echo "the user is:" > /username.txt',
        'whoami >> /username.txt',
        'echo "Okay, this is now done"'
      ),
      features: {
        bufferLog: true,
        azureLivelog: false,
        extractArtifacts: true
      },
      artifacts: {
        // name -> source
        'username.txt': 'username.txt',
        'passwd.txt': '/etc/passwd',
        'my-missing.txt': '/this-file-is-missing.txt'
      },
      maxRunTime:         5 * 60
    });
    // Get task specific results.
    var result = data.result.result;
    var artifacts = result.artifacts;
    assert.equal(result.exitCode, 0);

    // Ensure these have no errors...
    assert.ok(!artifacts['username.txt'].error, 'username.txt should exist');
    assert.ok(!artifacts['passwd.txt'].error, 'passwd.txt should exist');

    // Missing artifact should have an error...
    assert.ok(
      artifacts['my-missing.txt'].error,
      'missing artifact should have an error'
    );

    assert.ok(
      !artifacts['my-missing.txt'].url, 'missing endpoints should not have a url'
    );
  }));
});
