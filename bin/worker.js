var program = require('commander');
var co = require('co');
var taskcluster = require('taskcluster-client');
var dockerOpts = require('dockerode-options');

var SDC = require('statsd-client');
var Docker = require('dockerode-promise');
var Config = require('../lib/configuration');
var TaskListener = require('../lib/task_listener');
var Stats = require('../lib/stat');

// Available target configurations.
var allowedConfiguration = ['aws'];

// All overridable configuration options from the CLI.
var overridableFields =
  ['capacity', 'workerId', 'workerType', 'workerGroup', 'provisionerId'];

// Terrible wrapper around program.option.
function o() {
  program.option.apply(program, arguments);
}

/* Options for CLI */
o('--target <type>',
  'configure worker for target [' + allowedConfiguration.join(', ') + ']');
o('-c, --capacity <value>', 'capacity override value');
o('--provisioner-id <provisioner-id>','override provisioner id configuration');
o('--worker-type <worker-type>', 'override workerType configuration');
o('--worker-group <worker-group>', 'override workerGroup');
o('--worker-id <worker-id>', 'override the worker id');

program.parse(process.argv);

/* Main */
co(function *() {
  // Placeholder for final configuration options.
  var config = {
    docker: new Docker(dockerOpts()),
    // TODO: Authentication.
    queue: new taskcluster.Queue(),
    scheduler: new taskcluster.Scheduler()
  };

  // Use a target specific configuration helper if available.
  if (program.target) {
    if (allowedConfiguration.indexOf(program.target) === -1) {
      console.log(
        '%s is not a configuration target allowed: %s',
        program.target,
        allowedConfiguration.join(', ')
      );
      return process.exit(1);
    }

    // execute the configuration helper and merge the results
    var targetConfig =
      yield require('../lib/configuration/' + program.target)();

    for (var key in targetConfig) {
      config[key] = targetConfig[key];
    }
  }

  // process CLI specific overrides
  overridableFields.forEach(function(field) {
    if (!(field in program)) return;
    config[field] = program[field];
  });

  // Raw statsd interface.
  config.statsd = new SDC({
    debug: !!process.env.DEBUG,
    // TOOD: Add real configuration options for this.
    host: '192.168.50.10',
    port: '8125',
    // docker-worker.<worker-type>.<provisionerId>.
    prefix: 'docker-worker.' +
      config.workerType + '.' +
      config.provisionerId + '.'
  });

  // Wrapped stats helper to support generators, etc...
  config.stats = new Stats(config.statsd);
  config.stats.increment('started');

  // Build the listener and connect to the queue.
  var taskListener = new TaskListener(new Config(config));
  yield taskListener.connect();

  // Gracefully(ish) handle shutdowns...
  process.once('SIGTERM', co(function* () {
    yield taskListener.close();
  }));

})(function(err) {
  if (!err) return;

  // Top level uncaught fatal errors!
  console.error(err);
  throw err; // nothing to do so show a message and crash
});
