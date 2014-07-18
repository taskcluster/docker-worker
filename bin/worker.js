var program = require('commander');
var co = require('co');
var taskcluster = require('taskcluster-client');
var dockerOpts = require('dockerode-options');
var url = require('url');
var loadConfig = require('../lib/config');

var SDC = require('statsd-client');
var Docker = require('dockerode-promise');
var Config = require('../lib/configuration');
var TaskListener = require('../lib/task_listener');
var Stats = require('../lib/stat');
var JaySchema = require('jayschema');

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

function jsonSchema() {
  var schema = new JaySchema();
  schema.register(require('../schemas/payload.json'));
  schema.register(require('../schemas/result.json'));

  return schema;
}

/* Main */
co(function *() {
  var workerConf = loadConfig();
  // Placeholder for final configuration options.
  var config = {
    docker: new Docker(dockerOpts()),
    // TODO: Authentication.
    queue: new taskcluster.Queue(),
    scheduler: new taskcluster.Scheduler(),
    schema: jsonSchema()
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

  var statsdConf = url.parse(workerConf.statsd.url);

  // Raw statsd interface.
  config.statsd = new SDC({
    debug: !!process.env.DEBUG,
    // TOOD: Add real configuration options for this.
    host: statsdConf.hostname,
    port: statsdConf.port,
    // docker-worker.<worker-type>.<provisionerId>.
    prefix: workerConf.statsd.prefix +
      'docker-worker.' +
      config.workerType + '.' +
      config.provisionerId + '.'
  });

  // Wrapped stats helper to support generators, etc...
  config.stats = new Stats(config.statsd);
  config.stats.increment('started');

  // Build the listener and connect to the queue.
  var taskListener = new TaskListener(new Config(config));
  yield taskListener.connect();


  // Test only logic for clean shutdowns (this ensures our tests actually go
  // throuhg the entire steps of running a task).
  if (process.env.NODE_ENV === 'test') {
    // Gracefullyish close the connection.
    process.once('message', co(function* (msg) {
      if (msg.type !== 'halt') return;
      // Halt will wait for the worker to be in an idle state then pause all
      // incoming messages and close the connection...
      function* halt() {
        taskListener.pause();
        yield taskListener.close();
      }
      if (taskListener.isIdle()) return yield halt;
      taskListener.once('idle', co(halt));
    }));
  }
})(function(err) {
  if (!err) return;
  // Top level uncaught fatal errors!
  console.error(err);
  throw err; // nothing to do so show a message and crash
});
