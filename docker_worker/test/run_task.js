/**
This is a test helper "rollup" intended to be used in integration testing the
public worker amqp interface.
*/
module.exports = function(amqp) {
  var server = require('./server');
  var worker = require('./worker')();

  var Publisher = require('amqpworkers/publisher');
  var Message = require('amqpworkers/message');
  var Promise = require('promise');

  var publisher;
  setup(function() {
    publisher = new Publisher(amqp.connection);
  });

  /**
  Starts a http server and runs a task (and reports back to the server)
  */
  return function runTask(task) {
    return new Promise(function(accept, reject) {
      var taskStatus = {};
      var request = {
        job: task
      };

      server().then(
        function serverListening(testServer) {
          request.claim = testServer.endpoint('post', function(req, res) {
            taskStatus.claimed = true;
            res.send(200);
          });

          request.finish = testServer.endpoint('post', function(req, res) {
            taskStatus.finish = req.body;
            res.send(200);
            accept(taskStatus);
          });
        }
      ).then(
        function() {
          return publisher.publish(
            '',
            'tasks',
            new Message(request)
          );
        },
        reject
      );
    });
  };
};
