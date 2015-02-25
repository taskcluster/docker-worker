/**
Primary interface which handles listening for messages and initializing the
execution of tasks.
*/

var QUEUE_PREFIX = 'worker/v1/';

var debug = require('debug')('docker-worker:task-listener');
var taskcluster = require('taskcluster-client');
var coPromise = require('co-promise');
var co = require('co');
var request = require('superagent-promise');

var Task = require('./task');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

/**
@param {Configuration} config for worker.
*/
function TaskListener(runtime) {
  this.runtime = runtime;
  this.runningTasks = [];
  EventEmitter.call(this);

  // If node will be shutdown, stop consuming events.
  if (this.runtime.shutdownManager) {
    this.runtime.shutdownManager.once(
      'shutdownManager:nodeTermination', co(function* () { yield this.close; })
    );
  }
}

TaskListener.prototype = {
  __proto__: EventEmitter.prototype,

  /**
  Number of running tasks...
  */
  pending: 0,

  cancelTask: co(function* (message) {
    var runId = message.payload.runId;
    var reason = message.payload.status.runs[runId].reasonResolved;
    if (reason !== 'canceled') return;

    var taskId = message.payload.status.taskId;
    var task = this.runningTasks.find(
      (task) => { return (task.status.taskId === taskId && task.runId === runId) }
    );

    if (!task) { debug('task not found to cancel'); return;}

    this.runtime.log('cancelling task', {taskId: message.payload.status.taskId});
    task.cancel(reason);
  }),

  connect: function* () {
    this.runtime.log('listener connect');

    var self = this;
    var queue = this.runtime.queue;

    var queueEvents = new taskcluster.QueueEvents();
    // Create PulseConnection to use with multiple listeners
    this.pulseConnection = new taskcluster.PulseConnection(this.runtime.pulse);

    this.cancelListener = new taskcluster.PulseListener({
      connection: this.pulseConnection,
    });

    this.cancelListener.bind(queueEvents.taskException({
      workerId: this.runtime.workerId,
      workerType: this.runtime.workerType,
      workerGroup: this.runtime.workerGroup,
      provisionerId: this.runtime.provisionerId
    }));

    this.cancelListener.on('message', this.cancelTask.bind(this));

    this.cancelListener.resume();


    // Share the queue between all workerTypes of the same provisioner.
    var queueName;
    if (this.runtime.createQueue) {
      queueName =
        QUEUE_PREFIX +
        this.runtime.provisionerId + '/' + this.runtime.workerType;
    }

    // Build the listener.
    var listener = this.listener = new taskcluster.PulseListener({
      prefetch:     this.runtime.capacity,
      connection:   this.pulseConnection,
      // Share the queue between all provisonerId + workerTypes.
      queueName:    queueName
      // TOOD: Consider adding maxLength.
    });

    yield listener.bind(queueEvents.taskPending({
      workerType: this.runtime.workerType,
      provisionerId: this.runtime.provisionerId
    }));

    debug('bind task pending', {
      workerType: this.runtime.workerType,
      provisionerId: this.runtime.provisionerId
    });

    debug('listen', {
      queueName: listener._queueName, capacity: this.runtime.capacity
    });

    var channel = yield listener.connect();

    // Rather then use `.consume` on the listener directly we use the channel
    // directly for greater control over the flow of messages.
    yield channel.consume(listener._queueName, co(function* (msg) {
      self.runtime.log('listener begin consume');
      var content;
      try {
        self.incrementPending();
        // All content from taskcluster should be a json payload.
        content = JSON.parse(msg.content);
        yield self.runTask(content);
        channel.ack(msg);
        // Only indicate a completed task (which may trigger an idle state)
        // after an ack/nack.
        self.decrementPending();
      } catch (e) {
        if (content) {
          self.runtime.log('task error', {
            taskId: content.status.taskId,
            runId: content.runId,
            message: e.toString(),
            stack: e.stack,
            err: e
          });
        } else {
          self.runtime.log('task error', {
            message: e.toString(),
            err: e
          });
        }
        var nack = channel.nack(msg, false, false);
        // Ensure we don't leak pending references.
        self.decrementPending();
      }
    }));
  },

  close: function* () {
    yield this.listener.close();
    yield this.cancelListener.close();
    yield this.pulseConnection.close();
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

  isIdle: function() {
    return this.pending === 0;
  },

  incrementPending: function() {
    // After going from an idle to a working state issue a 'working' event.
    if (++this.pending === 1) {
      this.emit('working', this);
    }
  },

  decrementPending: function() {
    this.pending--;
    if (this.pending === 0) {
      this.emit('idle', this);
    }
  },


  /**
  Handle the incoming message that a task is now pending.
  */
  runTask: function* (payload) {
    // Current task status.
    var runId = payload.runId;
    var status = payload.status;
    this.runtime.log('run task', { taskId: status.taskId, runId: runId });

    // Date when the task was created.
    var created = new Date(status.created);

    // Only record this value for first run!
    if (!status.runs.length) {
      // Record a stat which is the time between when the task was created and
      // the first time a worker saw it.
      this.runtime.stats.time('tasks.time.to_reach_worker', created);
    }

    // Fetch full task definition.
    var task = yield this.runtime.queue.task(status.taskId);

    // Create "task" to handle all the task specific details.
    var taskHandler = new Task(this.runtime, runId, task, status);
    var taskIndex = this.runningTasks.push(taskHandler);
    taskIndex = taskIndex-1;

    // Run the task and collect runtime metrics.
    try {
      yield taskHandler.claimAndRun()
      this.runningTasks.splice(taskIndex, 1);
      return;
    }
    catch (e) {
      // Make sure the running task is still removed before throwing
      this.runningTasks.splice(taskIndex, 1);
      throw e;
    }
  }
};

module.exports = TaskListener;
