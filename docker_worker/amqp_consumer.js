var Consumer = require('amqpworkers/consumer');
var stream = require('stream');
var assert = require('assert');
var taskrunner = require('./taskrunner');

var MIDDLEWARES = {
  times: require('./middleware/times'),
  bufferLog: require('./middleware/buffer_log'),
  azureLiveLog: require('./middleware/azure_livelog')
};

function AMQPConusmer(options) {
  assert(options.docker, '.docker option is given');
  assert(options.amqp, '.amqp option is given');

  Consumer.call(this, options.amqp);
  this.docker = options.docker;
}

AMQPConusmer.prototype = {
  __proto__: Consumer.prototype,

  /**
  Handle a message from the incoming queue.
  */
  read: function(message) {
    return taskrunner(this.docker, message).then(
      null,
      function epicFail(err) {
        debug('FAILED to process task', err);
      }
    );
  }
};

module.exports = AMQPConusmer;
