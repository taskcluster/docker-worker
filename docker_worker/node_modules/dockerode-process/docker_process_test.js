suite('docker process', function() {
  var DockerRun = require('./');
  var docker = require('./test/docker')();

  suite('#run - with pull', function() {
    var subject;
    setup(function() {
      subject = new DockerRun(docker, {
        create: {
          Image: 'ubuntu',
          Cmd: ['/bin/bash', '-c', 'echo stdout && echo stderr >&2'],
          Tty: true
        },
        start: {}
      });
    });

    test('single stream with pulling', function() {
      var expected = 'stdout\nstderr\n';
      var result = '';

      subject.stdout.on('data', function(value) {
        result += value;
      });

      return subject.run().then(function() {
        result = result.replace(/\r/g, '');
        assert.ok(result.indexOf('ubuntu') !== -1, 'mentions docker image');
        assert.ok(result.indexOf(expected) !== -1, 'has stdout/stderr');
      });
    });
  });

  suite('#run - with tty', function() {
    var subject;
    setup(function() {
      subject = new DockerRun(docker, {
        create: {
          Image: 'ubuntu',
          Cmd: ['/bin/bash', '-c', 'echo stdout && echo stderr >&2'],
          Tty: true
        },
        start: {}
      });
    });

    test('single stream from tty (no pull)', function() {
      var expected = 'stdout\nstderr\n';
      var result = '';

      subject.stdout.on('data', function(value) {
        result += value;
      });

      return subject.run({ pull: false }).then(function() {
        // ensure there are only \n and no \r
        result = result.replace('\r', '');
        assert.equal(expected.trim(), result.trim());
      });
    });
  });

  suite('#run - without tty (no pull)', function() {
    var subject;
    setup(function() {
      subject = new DockerRun(docker, {
        create: { Image: 'ubuntu', Cmd: ['/bin/bash', '-c', 'echo stdout && echo stderr >&2'] },
        start: {}
      });
    });

    var stdoutBuffer;
    var stderrBuffer;

    test('run docker image', function() {
      stderrBuffer = [];
      stdoutBuffer = [];

      function append(buffer, item) {
        buffer.push(item.toString());
      }

      var promise = subject.run({ pull: false });

      assert.ok(subject.stdout, 'has stdout, stream');
      assert.ok(subject.stderr, 'has stderr stream');

      subject.stdout.on('data', append.bind(null, stdoutBuffer));
      subject.stderr.on('data', append.bind(null, stderrBuffer));
      assert.equal(subject.exitCode, null);


      var didExit = false;
      subject.once('exit', function() {
        didExit = true;
      });

      return promise.then(
        function(status) {
          assert.ok(stderrBuffer.length, 'has stderr');
          assert.ok(stdoutBuffer.length, 'has stdout');
          assert.equal(stdoutBuffer[0].trim(), 'stdout');
          assert.equal(stderrBuffer[0].trim(), 'stderr');
          assert.ok(subject.container, 'has container');

          assert.equal(subject.exitCode, 0);
          assert.equal(status, subject.exitCode);
          assert.ok(didExit, 'stream is marked as exited');
        }
      );
    });
  });

  suite('#remove', function() {
    var subject;
    setup(function() {
      subject = new DockerRun(docker, {
        create: { Image: 'ubuntu', Cmd: ['/bin/bash', '-c', 'echo stdout && echo stderr >&2'] },
        start: {}
      });

      return subject.run();
    });

    setup(function() {
      return subject.remove();
    });

    test('after remove', function() {
      return docker.getContainer(subject.id).inspect().then(
        function(value) {
          throw new Error('should not be able to find record');
        },
        function() {
          // yey it works
        }
      );
    });
  });

});
