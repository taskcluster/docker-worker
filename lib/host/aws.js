/**
Return the appropriate configuration defaults when on aws.
*/

var request = require('superagent-promise');
var debug = require('debug')('docker-worker:configuration:aws');
var os = require('os');

function minutes(n) {
  return n * 60;
}

/**
AWS Metadata service endpoint.

@const
@see http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AESDG-chapter-instancedata.html
*/
var BASE_URL = 'http://169.254.169.254/2012-01-12';

/**
AWS Bills hourly if this ever changes this will also need to change.
*/
var BILLING_CYCLE = minutes(60);

function* getText(url) {
  var res = yield request.get(url).end();
  return res.text;
}

/**
@return Number of seconds left in the billing cycle.
*/
function* billingCycleRemaining() {
  // We use os.uptime to attempt to figure out our billing cycle which may or
  // may not be the perfect number here...
  return Math.ceil(BILLING_CYCLE - (os.uptime() % minutes(60)));
}


module.exports.billingCycleRemaining = billingCycleRemaining;

/**
Read AWS metadata and user-data to build a configuration for the worker.

@param {String} [baseUrl] optional base url override (for tests).
@return {Object} configuration values.
*/
function* configure (baseUrl) {
  baseUrl = baseUrl || BASE_URL;

  // defaults per the metadata
  var config = yield {
    // Since this is aws configuration after all...
    provisionerId: 'aws-provisioner',
    workerId: getText(baseUrl + '/meta-data/instance-id'),
    workerType: getText(baseUrl + '/meta-data/ami-id'),
    workerGroup: getText(baseUrl + '/meta-data/placement/availability-zone'),
  };

  // Shutdown configuration options (notice these can be override toon...)
  config.shutdown = true; // Shutdown idle nodes by default on aws.

  // Number of seconds left in cycle when we can trigger a shutdown.
  config.shutdownSecondsStart = minutes(12);

  // Number of seconds left where we do _not_ shutdown (wait for another cycle).
  config.shutdownSecondsStop = minutes(2);

  // query the user data for any instance specific overrides set by the
  // provisioner.
  var userdata = yield request.get(baseUrl + '/user-data').end();

  if (!userdata.ok) {
    debug('userdata not available')
    return config;
  }
  // parse out overrides from user data
  var overrides = JSON.parse(new Buffer(userdata.text, 'base64'));
  for (var key in overrides) config[key] = overrides[key];

  return config;
};

module.exports.configure = configure;

