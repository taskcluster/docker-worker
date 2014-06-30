var assert = require('assert');

function Configuration(options) {
  assert(typeof options === 'object', 'options must be an object.');
  for (var key in options) this[key] = options[key];
}

Configuration.prototype = {
  /**
  AMQP connection string.

  @type String
  */
  amqp: null,

  /**
  Capacity of the worker.

  @type {Number}
  */
  capacity: 0,

  /**
  Identifier for this worker.

  @type {String}
  */
  workerId: null,

  /**
  Type of the current worker.

  @type {String}
  */
  workerType: null,

  /**
  Which group of workers this worker belongs to.
  @type {String}
  */
  workerGroup: null,

  /**
  The provisioner who is responsible for this worker.
  */
  provisionerId: null
};

module.exports = Configuration;
