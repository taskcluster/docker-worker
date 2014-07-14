/**
Primary interface which handles listening for messages and initializing the
execution of tasks.
*/

var QUEUE_PREFIX = 'docker-worker-';

var debug = require('debug')('docker-worker:task-listener');
var taskcluster = require('taskcluster-client');
var coPromise = require('co-promise');
var co = require('co');
var request = require('superagent-promise');

var Task = require('./task');

/**
@param {Configuration} config for worker.
*/
function TaskListener(config) {
  this.config = config;
}

TaskListener.prototype = {
  connect: function* () {
    debug('connect');

    var queue = this.config.queue;

    // Fetch the amqp connection details if none are present.
    if (!this.config.amqp) {
      debug('fetching amqp connection string');
      this.config.amqp = (yield queue.getAMQPConnectionString()).url;
    }

    // Share the queue between all workerTypes of the same provisioner.
    var queueName =
      QUEUE_PREFIX + this.config.provisionerId + '-' + this.config.workerType;

    var queueEvents = new taskcluster.QueueEvents();

    // Build the listener.
    var listener = this.listener = new taskcluster.Listener({
      prefetch: this.config.capacity,
      connectionString: this.config.amqp,
      // Share the queue between all provisonerId + workerTypes.
      queueName: queueName
      // TOOD: Consider adding maxLength.
    });

    listener.on('message', function(message) {
      // Per taskcluster-client conventions the event listener returns a promise
      // when the promise is resolved the message is ack'ed and nack'ed when
      // rejected.
      return coPromise(this.handleEvent(message));
    }.bind(this));

    debug('listen', { queueName: queueName, capacity: this.config.capacity });
    yield listener.bind(queueEvents.taskPending({
      workerType: this.config.workerType,
      provisionerId: this.config.provisionerId
    }));

    debug('bind task pending', {
      workerType: this.config.workerType,
      provisionerId: this.config.provisionerId
    });

    yield listener.connect();

    // Send a message to the parent process that we have started up if `.send`
    // is around. This is to allow our integration tests to correctly time when
    // to send messages to the queue for our worker.
    if (process.send) process.send({ type: 'startup' });
  },

  close: function* () {
    return yield this.listener.close();
  },

  /**
  Halt the flow of incoming tasks (but handle existing ones).
  */
  pause: function* () {
    return yield this.listener.pause();
  },

  /**
  Resume the flow of incoming tasks.
  */
  resume: function* () {
    return yield this.listener.resume();
  },

  /**
  Handle the incoming message that a task is now pending.
  */
  handleEvent: function* (message) {
    var payload = message.payload;

    // Current task status.
    var status = payload.status;

    // Date when the task was created.
    var created = new Date(status.created);

    // Only record this value for first run!
    if (!status.runs.length) {
      // Record a stat which is the time between when the task was created and
      // the first time a worker saw it.
      this.config.stats.time('tasks.time.to_reach_worker', created);
    }

    // Fetch the full task defintion.
    var taskReq = yield request.
      get('http://tasks.taskcluster.net/' + status.taskId + '/task.json').
      end();

    // Edge case where we have random bad status data.
    if (!taskReq.ok) {
      console.error('Invalid task from status: ', status);
      return;
    }

    var task = taskReq.body;

    var taskHandler = new Task(this.config, task, status);
    // Stat to overall completion time.
    return yield* this.config.stats.timeGen(
      'tasks.time.total', taskHandler.run()
    );
  }
};

module.exports = TaskListener;
