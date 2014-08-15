suite('docker registry', function() {
  var Image = require('./docker_image');

  test('#canAuthenticate', function() {
    assert.ok(!new Image('registry').canAuthenticate(), 'single part');
    assert.ok(!new Image('foo/bar').canAuthenticate(), 'two parts');
    assert.ok(!new Image('foo/bar/').canAuthenticate(), 'empty parts trailing');
    assert.ok(!new Image('/foo/bar').canAuthenticate(), 'empty parts leading');
    assert.ok(!new Image('/foo/bar/').canAuthenticate(), 'empty parts both');
    assert.ok(new Image('xfoo/foo/bar').canAuthenticate(), 'valid');
  });

  var repositories = {
    'quay.io': { username: 'quay.io' },
    'quay.io/repo': { username: 'quay.io/repo' }
  };

  test('#credentials - root', function() {
    var image = new Image('quay.io/foobar/baz');
    assert.equal(image.credentials(repositories), repositories['quay.io']);
  });

  test('#credentials - none', function() {
    var image = new Image('other/thing/wow');
    assert.equal(image.credentials(repositories), null);
  });

  test('#credentials - particular user', function() {
    var image = new Image('quay.io/repo/image');
    assert.equal(image.credentials(repositories), repositories['quay.io/repo']);
  });

});
