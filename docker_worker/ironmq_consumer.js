var Promise = require('promise');
var IronMQ = require('./ironmq');
var assert = require('assert');
var taskrunner = require('./taskrunner');
var debug = require('debug')('taskcluster-docker-worker:ironmq');

var INTERVAL = 1000;

function IronMQConsumer(options) {
  assert(options.queue, 'has queue name');
  assert(options.docker, 'passes docker');

  this.interval = options.interval || INTERVAL;
  this.docker = options.docker;
  this.queue = new IronMQ(options.queue);
}

IronMQConsumer.prototype = {
  interval: 0,
  timerId: null,

  _poll: function() {
    this.timerId = setTimeout(this.poll.bind(this), this.interval);
  },

  poll: function() {
    // do very dumb polling for now
    return this.queue.get({ n: 1 }).then(
      function(message) {
        if (!message) return this._poll();
        debug('pulled message', message);
        var id = message.id;
        var body = JSON.parse(message.body);
        return this.handleMessage(id, body);
      }.bind(this)
    ).then(
      this._poll.bind(this)
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
