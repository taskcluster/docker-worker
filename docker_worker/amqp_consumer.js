var Consumer = require('amqpworkers/consumer');
var JobAPI = require('./job_api');
var Task = require('./task');
var DockerProc = require('dockerode-process');
var Middleware = require('middleware-object-hooks');

var debug = require('debug')('taskclsuter-docker-worker:amqp_consumer');

var stream = require('stream');
var assert = require('assert');

var MIDDLEWARES = {
  times: require('./middleware/times'),
  bufferLog: require('./middleware/buffer_log'),
  azureLiveLog: require('./middleware/azure_livelog')
};

/**
Build the create configuration for the docker container.
*/
function createConfig(overrides) {
  var opts = {
    'Hostname': '',
    'User': '',
    'AttachStdin': false,
    'AttachStdout': true,
    'AttachStderr': true,
    'Tty': true,
    'OpenStdin': false,
    'StdinOnce': false,
    'Env': null,
    'Volumes': {},
    'VolumesFrom': ''
  };

  for (var key in overrides) opts[key] = overrides[key];
  return opts;
}

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
    // task result/output
    var output = {
      artifacts: {},
      extra_info: {}
    };

    var api = new JobAPI(message);
    var task = new Task(api.job);
    var middleware = new Middleware();

    // always turn on times
    middleware.use(MIDDLEWARES.times());

    // this is mostly a debugging middleware so its off by default
    if (task.feature('buffer_log', false)) {
      middleware.use(MIDDLEWARES.bufferLog());
    }

    // live logging should always be on
    if (task.feature('azure_livelog', true)) {
      middleware.use(MIDDLEWARES.azureLiveLog());
    }

    var dockerProcess = new DockerProc(this.docker, {
      start: task.startContainerConfig(),
      create: task.createContainerConfig()
    });

    return middleware.run('start', task, dockerProcess).then(
      function() {
        return api.sendClaim();
      }
    ).then(
      function initiateExecute(value) {
        return dockerProcess.run();
      }
    ).then(
      function processRun(code) {

        output.task_result = {
          exit_status: code
        };

        return middleware.run('end', output, task, dockerProcess);
      }
    ).then(
      function sendFinish(output) {
        return api.sendFinish(output).then(
          function() {
            return dockerProcess.remove();
          }
        );
      }
    ).then(
      null,
      function epicFail(err) {
        // XXX: this should either nack or "finish" with an error.
        debug('FAILED to process task', err);
      }
    );
  }
};

module.exports = AMQPConusmer;
