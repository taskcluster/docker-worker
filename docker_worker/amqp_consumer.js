var Consumer = require('amqpworkers/consumer');
var JobAPI = require('./job_api');
var Task = require('./task');
var DockerProc = require('dockerode-process');

var debug = require('debug')('taskclsuter-docker-worker:amqp_consumer');

var ghettoStream = require('./ghetto_stream');
var stream = require('stream');
var assert = require('assert');

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
    // running time details of this task
    var times = {
      started_timestamp: Date.now()
    };

    // task result/output
    var output = {
      times: times
    };

    var stream = ghettoStream();
    var api = new JobAPI(message);
    var task = new Task(api.job);

    var dockerProcess = new DockerProc(this.docker, {
      start: task.startContainerConfig(),
      create: task.createContainerConfig()
    });

    // we are always in TTY mode which only outputs to stdout
    dockerProcess.stdout.pipe(stream);

    return api.sendClaim().then(
      function initiateExecute(value) {
        return dockerProcess.run();
      }
    ).then(
      function executeResult(code) {
        // stream as text output for our alpha version
        output.extra_info = {
          log: stream.text
        };

        output.task_result = {
          exit_status: code
        };

        times.finished_timestamp = Date.now();

        // / 1000 since this is JS and we are in MS land.
        times.runtime_seconds =
          (times.finished_timestamp - times.started_timestamp) / 1000;

        // send the result
        return api.sendFinish(output).then(
          // remove the container
          function() {
            return dockerProcess.remove();
          }
        );
      },
      function epicFail(err) {
        // XXX: this should either nack or "finish" with an error.
        debug('FAILED to process task', err);
      }
    );
  }
};

module.exports = AMQPConusmer;
