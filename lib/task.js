var debug = require('debug')('runTask');
var request = require('superagent-promise');
var util = require('util');

var DockerProc = require('dockerode-process');
var PassThrough = require('stream').PassThrough;
var States = require('./states');

var features = require('./features');

var PAYLOAD_SCHEMA =
  'http://schemas.taskcluster.net/docker-worker/v1/payload.json#';

var RESULT_SCHEMA =
  'http://schemas.taskcluster.net/docker-worker/v1/result.json#';

function waitForEvent(listener, event) {
  return function(callback) {
    listener.once(event, callback.bind(this, null));
  }
}

/*
@example

taskEnvToDockerEnv({ FOO: true });
// => ['FOO=true']

@private
@param {Object} env key=value pair for environment variables.
@return {Array} the docker array format for variables
*/
function taskEnvToDockerEnv(env) {
  if (!env || typeof env !== 'object') {
    return env;
  }

  return Object.keys(env).reduce(function(map, name) {
    map.push(name + '=' + env[name]);
    return map;
  }, []);
}


/**
Convert the feature flags into a state handler.

@param {Object} task definition.
*/
function buildStateHandlers(task) {
  var handlers = [];
  var featureFlags = task.payload.features || {};

  for (var flag in features) {
    var enabled = featureFlags[flag] || features[flag].defaults;
    if (enabled) {
      handlers.push(new (features[flag].module)());
    }
  }

  return new States(handlers);
}

function Task(config, runId, task, status) {
  this.runId = runId;
  this.task = task;
  this.status = status;
  this.config = config;

  // Primarly log of all actions for the task.
  this.stream = new PassThrough();
  // states actions.
  this.states = buildStateHandlers(task);
}

Task.prototype = {
  /**
  Build the docker container configuration for this task.

  @param {Array[dockerode.Container]} [links] list of dockerode containers.
  */
  dockerConfig: function(links) {
    var config = this.task.payload;
    var env = config.env || {};

    // TODO: Remove me once the graph can be accessed from the client.
    if (!env.TASK_ID) {
      env.TASK_ID = this.status.taskId;
    }

    var procConfig = {
      start: {},
      create: {
        Image: config.image,
        Cmd: config.command,
        Hostname: '',
        User: '',
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        OpenStdin: false,
        StdinOnce: false,
        Env: taskEnvToDockerEnv(env)
      }
    }

    if (links) {
      procConfig.start.Links = links.map(function(container) {
        return container.name + ':taskcluster';
      });
    }

    return procConfig;
  },

  createTaskclusterProxy: function* () {
    var docker = this.config.docker;

    // create the container.
    var container = yield docker.createContainer({
      Image: 'taskcluster/proxy',
      Cmd: []
    });

    // Terrible hack to get container promise proxy.
    container = docker.getContainer(container.id);
    container.name = (yield container.inspect()).Name.slice(1);

    // Initialize the container.
    var output = yield container.start({});
    // TODO: Save the logs to another log file?
    return container;
  },

  fmtLog: function() {
    var args = Array.prototype.slice.call(arguments);
    return '[taskcluster] ' + util.format.apply(this, args) + '\r\n';
  },

  logHeader: function() {
    return this.fmtLog(
      'taskId: %s, workerId: %s \r\n',
      this.status.taskId, this.config.workerId
    );
  },

  logFooter: function(success, start, finish) {
    // Human readable success/failure thing...
    var humanSuccess = success ?
      'Successfully' :
      'Unsuccessfully';

    // Yes, date subtraction yields a Number.
    var duration = finish - start;

    return this.fmtLog(
      '%s completed task with exit code: %d in %d seconds',
      humanSuccess, result.result.exitCode, duration
    );
  },

  logSchemaErrors: function(prefix, errors) {
    return this.fmtLog(
      "%s format is invalid json schema errors:\n %s",
      prefix, JSON.stringify(errors, null, 2)
    );
  },

  validateResult: function(result) {
    var resultErrors = this.config.schema.validate(result, RESULT_SCHEMA);
    if (!resultErrors.length) {
      return true;
    }

    this.stream.write(
      this.logSchemaErrors('Task result (worker error)', resultErrors)
    );

    return false;
  },

  abortRun: function* (exitCode) {
    var result = {
      version: '0.2.0',
      artifacts: {},
      statistics: {},
      metadata: {
        workerGroup: this.config.workerGroup,
        workerId: this.config.workerId,
        success: false
      },
      // This is worker/task specific results
      result: {
        exitCode: exitCode
      }
    };

    // This should never happen but validate our hardcoded result anyway.
    this.validateResult(result);

    yield this.finalizeLogs(result);
    return yield this.completeRun(false);
  },

  finalizeLogs: function* () {
    // No more logging to the primary terminal.log can happen at this point.
    //yield this.stream.end.bind(this.stream, this.logFooter(result));
  },

  completeRun: function* (success) {
    yield this.config.stats.timeGen(
      'tasks.time.completed',
      this.config.queue.reportCompleted(
        this.status.taskId, this.runId, { success: success }
      )
    );
  },

  run: function* () {
    var taskStart = new Date();
    var stats = this.config.stats;
    var queue = this.config.queue;
    // Everything starts with the claiming of the task... In theory this should
    // never fail unless we have multiple worker groups using different queue
    // names.
    stats.increment('tasks.attempted_claim');
    var claimConfig = {
      workerId: this.config.workerId,
      workerGroup: this.config.workerGroup
    };

    var claim = this.claim = yield stats.timeGen(
      'tasks.time.claim',
      queue.claimTask(this.status.taskId, this.runId, claimConfig)
    );

    // Cork all writes to the stream until we are done setting up logs.
    this.stream.cork();

    // Task log header.
    this.stream.write(this.logHeader());

    // Begin working on the task.
    var taskclusterProxy =
      yield* stats.timeGen('tasks.time.proxy', this.createTaskclusterProxy());

    var dockerProc = this.dockerProcess = new DockerProc(
      this.config.docker, this.dockerConfig([taskclusterProxy])
    );

    // Pipe the stream into the task handler stream. This has a small
    // performance cost but allows us to send all kinds of additional (non
    // docker) related logs to the "terminal.log" in an ordered fashion.
    dockerProc.stdout.pipe(this.stream, {
      end: false
    });

    // Hooks prior to running the task.
    yield stats.timeGen(
      'tasks.time.states.created', this.states.created(this)
    );

    // At this point all readers of our stream should be attached and we can
    // uncork.
    this.stream.uncork();

    // Validate the schema!
    var payloadErrors =
      this.config.schema.validate(this.task.payload, PAYLOAD_SCHEMA);

    if (payloadErrors.length) {
      // Inform the user that this task has failed due to some configuration
      // error on their part.
      this.stream.write(this.logSchemaErrors('`task.payload`', payloadErrors));

      // Docker uses negative exit codes to indicate infrastructure errors. We
      // copy this convention over (for better or worse).
      return yield this.abortRun(-127);
    }

    // start the timer to ensure we don't go overtime.
    var maxRuntimeMS = this.task.payload.maxRunTime * 1000;
    var runtimeTimeoutId = setTimeout(function() {
      stats.increment('tasks.timed_out');
      stats.gauge('tasks.timed_out.max_run_time', this.task.payload.maxRunTime);
      // we don't wait for the promise to resolve just trigger kill here which
      // will cause run below to stop processing the task and give us an error
      // exit code.
      dockerProc.kill();
      this.stream.write(this.fmtLog(
        'Task timeout after %d seconds. Force killing container.',
        this.task.payload.maxRunTime
      ));
    }.bind(this), maxRuntimeMS);

    var exitCode = yield* stats.timeGen('tasks.time.run', dockerProc.run());
    clearTimeout(runtimeTimeoutId);

    // XXX: Semi-hack to ensure all consumers of the docker proc stdout get the
    // entire contents. Ideally we could just wait for the end cb but that does
    // not seem to help in this case...
    if (!dockerProc.stdout._readableState.endEmitted) {
      // We wait _before_ extractResult so those states hooks can add items
      // to the stream.
      yield waitForEvent(dockerProc.stdout, 'end');
    }

    // Extract any results from the hooks.
    yield stats.timeGen(
      'tasks.time.states.stopped', this.states.stopped(this)
    );

    // Wait for the stream to end entirely before killing remaining containers.
    yield this.stream.end.bind(this.stream);

    // Cleanup all containers.
    yield *stats.timeGen(
      'tasks.time.removed',
      [dockerProc.remove(), taskclusterProxy.kill()]
    );

    yield stats.timeGen(
      'tasks.time.states.killed', this.states.killed(this)
    );

    // Remove proxy service after we killed it.
    yield stats.timeGen('tasks.time.removed_proxy', taskclusterProxy.remove());

    // If the results validation failed we consider this task failure.
    return yield this.completeRun(exitCode === 0);
  }
};

module.exports = Task;
