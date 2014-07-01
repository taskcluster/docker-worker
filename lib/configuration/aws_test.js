var app = require('../../test/aws_metadata');
var http = require('http');
var co = require('co');
var awsConfig = require('./aws');
var assert = require('assert');

suite('configuration/aws', function() {

  var server;
  var url;
  setup(function(done) {
    server = http.createServer(app.callback());
    server.listen(function() {
      url = 'http://localhost:' + server.address().port;
      done();
    });
  });

  teardown(function(done) {
    server.close(done);
  });

  test('configuration', co(function* () {
    var config = yield awsConfig(url);
    // values are mocked from the local aws metadata server.
    assert.deepEqual(config, {
      provisionerId: 'aws-provisioner',
      workerId: 'i-123456',
      workerType: 'ami-333333',
      workerGroup: 'us-west-2',
      capacity: 1
    });
  }));

});
