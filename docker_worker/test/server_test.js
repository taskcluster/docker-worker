suite('test server test', function() {
  var agent = require('superagent-promise');
  var server = require('./server');

  var subject;
  setup(function() {
    return server().then(
      function(result) {
        subject = result;
      }
    );
  });

  suite('#urlEndpoint', function() {
    test('issue request to given url', function() {
      var url = subject.endpoint('get', '/xfoo', function(req, res) {
        res.send({woot: true}, 200);
      });

      return agent('GET', url).end().then(
        function(res) {
          assert.deepEqual(res.body, { woot: true });
          assert.equal(res.statusCode, 200);
        }
      );
    });
  });
});
