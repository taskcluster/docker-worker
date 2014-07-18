suite('shutdown logic', function() {
  var subject = require('./shutdown');

  test('remainder: 60, stops between 12-2', function() {
    assert.ok(!subject(60, 12, 2));
  });

  test('remainder: 13, stops betweeen 12-2', function() {
    assert.ok(!subject(13, 12, 2));
  });

  test('remainder: 6, stops betweeen 12-2', function() {
    assert.ok(subject(6, 12, 2));
  });

  test('remainder: 12, stops betweeen 12-2', function() {
    assert.ok(subject(12, 12, 2));
  });

  test('remainder: 2, stops betweeen 12-2', function() {
    assert.ok(subject(2, 12, 2));
  });

  test('remainder: 1, stops betweeen 12-2', function() {
    assert.ok(!subject(1, 12, 2));
  });

  test('invalid range start < stop', function() {
    assert.throws(function() {
      subject(20, 2, 12)
    });
  });
});
