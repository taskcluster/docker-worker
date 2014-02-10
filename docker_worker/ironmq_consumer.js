var Promise = require('promise');
var IronMQ = require('./ironmq');
var EventEmitter = require('events').EventEmitter;

var assert = require('assert');
var taskrunner = require('./taskrunner');
var debug = require('debug')('taskcluster-docker-worker:ironmq');

var INTERVAL = 5000;

function IronMQConsumer(options) {
  assert(options.queue, 'has queue name');
  assert(options.docker, 'passes docker');

  this.interval = options.interval || INTERVAL;
  this.docker = options.docker;
  this.queue = new IronMQ(options.queue);
  this.onError = this.onError.bind(this);

  EventEmitter.call(this);
}

IronMQConsumer.prototype = {
  __proto__: EventEmitter.prototype,
  interval: 0,
  timerId: null,

  _poll: function() {
    debug('wait for message', this.interval);
    clearTimeout(this.timerId);
    this.timerId = setTimeout(this.poll.bind(this), this.interval);
  },

  onError: function(err) {
    // XXX: Implement real error handling...
    debug('error processing message', err);
    this.poll();
  },

  poll: function() {
    debug('poll ping');

    // attempt to fetch N messages
    this.queue.get({ n: 1 }).then(
      function(message) {
        // if there is no message wait interval then call poll again.
        if (!message) return this._poll();

        debug('pulled message', message);
        var id = message.id;
        var body = JSON.parse(message.body);

        // if we have a message work it then trigger poll directly.
        this.handleMessage(id, body).then(
          this.poll.bind(this),
          this.onError
        );

      }.bind(this)
    );
  },

  stop: function() {
    clearTimeout(this.timerId);
  },

  handleMessage: function(id, body) {
    debug('handle message', id, body);
    return taskrunner(this.docker, body).then(
      function() {
        return this.queue.del(id);
      }.bind(this),
      function epicFail(err) {
        debug('epic fail!', err);
      }
    );
  }
};

module.exports = IronMQConsumer;
