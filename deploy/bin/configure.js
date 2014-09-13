var co = require('co');
var fs = require('fs');
var fsPath = require('path');
var color = require('cli-color');
var prompt = require('co-prompt');
var util = require('util');
var program = require('commander');
var template = require('json-templater/string');

var CONFIG = __dirname + '/../../deploy.json';
var TPL_SOURCE = __dirname + '/../template/';
var TPL_TARGET = __dirname + '/../target/';

var TEMPLATES = [
  'packer/app.json',
  'packer/base.json',
  'etc/defaults/docker-worker'
]

var DESCRIPTIONS = {
  debugLevel: {
    description: 'Debug level for worker (see debug npm module)',
    value: '*'
  },
  taskclusterClientId: {
    description: 'Taskcluster client id',
    value: process.env.TASKCLUSTER_CLIENT_ID
  },
  taskclusterAccessToken: {
    description: 'Taskcluster access token',
    value: process.env.TASKCLUSTER_ACCESS_TOKEN
  },
  statsdPrefix: {
    description: 'statsd prefix token',
    value: process.env.STATSD_PREFIX
  },
  statsdUrl: {
    description: 'statsd url endpoint',
    value: process.env.STATSD_URL
  },
  logglyAccount: {
    description: 'Loggly account name',
  },
  logglyAuth: {
    description: 'Loggly authentication token',
  },
  fsType: {
    description: 'Docker filesystem type (aufs, btrfs)',
    value: 'aufs'
  },
  papertrail: {
    description: 'Papertrail host + port'
  }
};

function* question(field, desc) {
  return yield prompt(
    '  ' + color.cyan(field) + ' (' + color.white(desc) + ') : '
  );
}

function* configure() {
  // Current configuration for the deploy...
  var currentConfig = {};

  // Load the config file if it exists to override the defaults...
  if (fs.existsSync(CONFIG)) {
    currentConfig = require(CONFIG);
  }

  // Prompt for all the configurations.
  for (var key in DESCRIPTIONS) {
    var desc = DESCRIPTIONS[key].description;
    var defaultValue = currentConfig[key] || DESCRIPTIONS[key].value

    var humanDesc =
      color.white(key + ': ') +
      color.cyanBright(
        desc + (defaultValue ? ' (' + defaultValue + ')' : '') + ': '
      );

    currentConfig[key] = (yield prompt(humanDesc)) || defaultValue;
  }

  console.log();
  console.log(util.inspect(currentConfig, { colors: true }));
  console.log();

  // Yeah bad things will happen if rejected too often...
  if (!(yield prompt.confirm("Does this look right? "))) {
    return yield configure();
  }

  fs.writeFileSync(CONFIG, JSON.stringify(currentConfig, null, 2));
  return currentConfig;
}

co(function*() {
  console.log(color.yellowBright('Deploy configuration') + '\n');

  var config = yield configure();
  TEMPLATES.forEach(function(file) {
    // Figure out where to write stuff...
    var source = fsPath.resolve(fsPath.join(TPL_SOURCE, file));
    var target = fsPath.resolve(fsPath.join(TPL_TARGET, file));
    var content = fs.readFileSync(source, 'utf8');

    console.log(color.blue('Writing: ' + target) + '\n');
    fs.writeFileSync(target, template(content, config));
  });
})(function(err) {
  if (err) throw err;
  process.exit();
});
