suite('Extract a folder as an artifact', function() {
  var co = require('co');
  var testworker = require('../testworker');
  var get = require('./helper/get');
  var cmd = require('./helper/cmd');


  test('folder as tar', co(function* () {
    var data = yield testworker({
      image: 'ubuntu',
      command: cmd(
        'mkdir -p "/xfoo/wow"',
        'echo "xfoo" > /xfoo/wow/bar.txt',
        'echo "text" > /xfoo/wow/another.txt'
      ),
      features: {},
      artifacts: {
        'xfoo.tar.gz': '/xfoo',
      },
      maxRunTime: 5 * 60
    });

    var result = data.result.result;
    var artifacts = data.result.artifacts;

    assert.ok(data.result.metadata.success, 'task was successful');
    assert.equal(result.exitCode, 0);
    assert.ok(artifacts['xfoo.tar.gz'], 'creates artifact');

    var artifact = artifacts['xfoo.tar.gz'];
    assert.equal(artifact.type, 'directory');
    assert.ok(!artifact.error, 'artifact is successfully uploaded');

    assert.deepEqual(
      artifact.files.sort(), ['wow/bar.txt', 'wow/another.txt'].sort(),
      'All files in the directory are listed in .files'
    );

    var bodies = yield {
      bar: get(artifact.url + '/wow/bar.txt'),
      another: get(artifact.url + '/wow/another.txt')
    }

    assert.deepEqual(bodies, {
      bar: 'xfoo\n',
      another: 'text\n'
    });
  }));

});
