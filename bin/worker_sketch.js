/**
Note: This must be invoked with --harmony
*/
var co = require('co');
var coPromise = require('co-promise');
var taskcluster = require('taskcluster-client');
var queue = new taskcluster.Queue();

//var queueEvents = new taskcluster.QueueEvents();

co(function* () {
  var connection = (yield queue.getAMQPConnectionString()).url;
  var queueEvents = new taskcluster.QueueEvents();
  var listener = new taskcluster.Listener({
    prefetch: 1,
    connectionString: connection
  });

  listener.bind(queueEvents.taskPending({ taskId: '*' }));

  yield listener.connect();

  listener.on('message', function(msg) {
    return coPromise(function* () {
      console.log('victory mofo', msg);
    });
  });
})(function(err) {
  // no problems
  if (!err) return;
  throw err;
});
