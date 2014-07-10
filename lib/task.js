var MIDDLEWARE_BUILDERS = [
  './middleware/buffer_log',
  './middleware/azure_livelog',
  './middleware/artifact_extractor',
  './middleware/artifact_log',
  './middleware/taskgraph_extension'
].map(function(path) {
  return require(path);
});

var debug = require('debug')('runTask');
var times = require('./middleware/times');
var request = require('superagent-promise');
var util = require('util');

var DockerProc = require('dockerode-process');
var Middleware = require('middleware-object-hooks');
var PassThrough = require('stream').PassThrough;

function waitForEvent(listener, event) {
  return function (callback) {
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

function buildMiddleware(task) {
  // Create middleware handler
  var middleware = new Middleware();

  // Always turn on times, we don't even want to read a feature flag for this
  middleware.use(times());

  // For each middleware option available, read the feature flag, and apply it
  // if necessary.
  MIDDLEWARE_BUILDERS.forEach(function(builder) {
    // Find feature flag
    var featureFlag = task.payload.features[builder.featureFlagName];

    // If undefined, use the default feature flag
    if (featureFlag === undefined) {
      featureFlag = builder.featureFlagDefault;
    }

    // Only enable the middleware if the task asks for it or if it is on by
    // default.
    if (!featureFlag) return;
    middleware.use(builder(featureFlag));
  });

  return middleware;
}

function* put(url, body) {
  var req = yield request.put(url).send(body).end();
  if (req.error) throw req.error;
}

function Task(config, task, status) {
  this.task = task;
  this.status = status;
  this.config = config;

  // Primarly log of all actions for the task.
  this.stream = new PassThrough();
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
    return '[taskcluster] '  + util.format.apply(this, args) + '\r\n';
  },

  logHeader: function() {
    return this.fmtLog(
      'taskId: %s, workerId: %s \r\n',
      this.status.taskId, this.config.workerId
    );
  },

  logFooter: function(result) {
    // Human readable success/failure thing...
    var humanSuccess = result.metadata.success ?
      'Successfully' :
      'Unsuccessfully';

    // Yes, date subtraction yields a Number.
    var duration =
      new Date(result.statistics.finished) -
      new Date(result.statistics.started);

    return this.fmtLog(
      '%s completed task with exit code: %d in %d seconds',
      humanSuccess, result.result.exitCode, duration / 1000
    );
  },

  run: function* () {
    var queue = this.config.queue;
    // Everything starts with the claiming of the task... In theory this should
    // never fail unless we have multiple worker groups using different queue
    // names.
    var claim = this.claim = yield queue.claimTask(this.status.taskId, {
      workerId: this.config.workerId,
      workerGroup: this.config.workerGroup
    });

    // Task log header.
    this.stream.write(this.logHeader());

    // Begin working on the task.
    var middleware = buildMiddleware(this.task);
    var taskclusterProxy = yield this.createTaskclusterProxy();
    var dockerProc = this.dockerProcess = new DockerProc(
      this.config.docker, this.dockerConfig([taskclusterProxy])
    );

    // Pipe the stream into the task handler stream. This has a small
    // performance cost but allows us to send all kinds of additional (non
    // docker) related logs to the "terminal.log" in an ordered fashion.
    dockerProc.stdout.pipe(this.stream, { end: false });

    // Hooks prior to running the task.
    yield middleware.run('start', this);

    // Handle hooks which generate logs.
    var logs = {};
    yield middleware.run('declareLogs', logs, this);
    yield put(claim.logsPutUrl, logs);


    // start the timer to ensure we don't go overtime.
    var maxRuntimeMS = this.task.payload.maxRunTime * 1000;
    var runtimeTimeoutId = setTimeout(function() {
      // we don't wait for the promise to resolve just trigger kill here which
      // will cause run below to stop processing the task and give us an error
      // exit code.
      dockerProc.kill();
      this.stream.write(this.fmtLog(
        'Task timeout after %d seconds. Force killing container.',
        this.task.payload.maxRunTime
      ));
    }.bind(this), maxRuntimeMS);

    // Run the task and wait for the final exit status.
    var exitCode = yield dockerProc.run();
    clearTimeout(runtimeTimeoutId);

    var result = {
      version:            '0.2.0',
      artifacts:          {},
      statistics: {
      },
      metadata: {
        workerGroup:      this.config.workerGroup,
        workerId:         this.config.workerId,
        success:          exitCode === 0
      },
      // This is worker/task specific results
      result: {
        exitCode:       exitCode
      }
    };

    // XXX: Semi-hack to ensure all consumers of the docker proc stdout get the
    // entire contents. Ideally we could just wait for the end cb but that does
    // not seem to help in this case...
    if (!dockerProc.stdout._readableState.endEmitted) {
      // We wait _before_ extractResult so those middleware hooks can add items
      // to the stream.
      yield waitForEvent(dockerProc.stdout, 'end');
    }

    // Extract any results from the hooks.
    yield middleware.run('extractResult', result, this);

    // No more logging to the primary terminal.log can happen at this point.
    yield this.stream.end.bind(this.stream, this.logFooter(result));

    // Finalize any logging related tasks (draining streams, etc..).
    yield middleware.run('finalizeLogs', result, this);

    // Post the result json so it is available when the task is marked complete.
    var resultReq = yield put(claim.resultPutUrl, result);

    // Cleanup some containers...
    yield [dockerProc.remove(), taskclusterProxy.kill()]

    // Remove proxy service after we killed it.
    yield taskclusterProxy.remove();

    yield queue.reportTaskCompleted(this.status.taskId, {
      runId: claim.runId,
      success: result.metadata.success,
      workerGroup: this.config.workerGroup,
      workerId: this.config.workerId
    });
  }
};

module.exports = Task;
