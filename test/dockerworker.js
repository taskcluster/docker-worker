var dockerOpts = require('dockerode-options');
var path = require('path');
var util = require('util');

var Promise = require('promise');
var Docker = require('dockerode-promise');
var DockerProc = require('dockerode-process');

var START_STR = '[docker-worker-test] started';

function waitForMessage(listener, event, data) {
  return new Promise(function(accept) {
    listener.on(event, function filter(value) {
      if (value.toString().indexOf(data) !== -1) {
        listener.removeListener(event, filter);
        accept();
      }
    });
  });
}

// Environment varibles to copy over to the docker instance.
var COPIED_ENV = [
  'DEBUG',
  'DOCKER_HOST',
  'AZURE_STORAGE_ACCOUNT',
  'AZURE_STORAGE_ACCESS_KEY'
];

function eventPromise(listener, event) {
  return new Promise(function(accept, reject) {
    listener.on(event, function(message) {
      accept(message);
    });
  });
}

function LocalWorker(provisionerId, workerType) {
  this.provisionerId = provisionerId;
  this.workerType = workerType;
  this.docker = new Docker(dockerOpts());
}

LocalWorker.prototype = {
  launch: function* () {
    var createConfig = {
      Image: 'taskcluster/docker-worker-test',
      Cmd: [
        '/bin/bash', '-c',
         [
          'node --harmony /worker/bin/worker.js',
          '-c 1',
          '--worker-group', 'random-local-worker',
          '--worker-id', this.workerType,
          '--provisioner-id', this.provisionerId,
          '--worker-type', this.workerType
         ].join(' ')
      ],
      Env: [
        'NODE_ENV=test',
        'DOCKER_WORKER_START="' + START_STR + '"'
      ],
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true
    };

    // Copy enviornment variables over.
    COPIED_ENV.forEach(function(key) {
      if (!(key in process.env)) return;
      createConfig.Env.push(util.format('%s=%s', key, process.env[key]));
    });

    var startConfig = {
      Binds: [
        util.format('%s:%s', path.resolve(__dirname, '..'), '/worker')
      ]
    };

    // If docker is supposed to connect over a socket set the socket as a bind
    // mount...
    var opts = dockerOpts();
    if (opts.socketPath) {
      startConfig.Binds.push(util.format(
        '%s:%s',
        opts.socketPath, '/var/run/docker.sock'
      ));
    }

    var proc = this.process = new DockerProc(this.docker, {
      create: createConfig,
      start: startConfig
    });

    function earlyExit() {
      throw new Error('Docker worker exited while starting up');
    }

    proc.on('exit', earlyExit);
    proc.run();
    // Wait for the start message.
    yield waitForMessage(proc.stdout, 'data', START_STR);
    // Allow stdout to be handled with usual methods.
    proc.stdout.pipe(process.stdout);
    proc.removeListener('exit', earlyExit);
  },

  terminate: function* () {
    if (this.process) {
      var proc = this.process;
      // Ensure the container is killed and removed.
      yield proc.container.kill();
      yield proc.container.remove();
      this.process = null;
    }
  }
};

// Export LocalWorker
module.exports = LocalWorker;

