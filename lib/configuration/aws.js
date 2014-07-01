/**
Return the appropriate configuration defaults when on aws.
*/

var request = require('superagent-promise');
var debug = require('debug')('docker-worker:configuration:aws');
var BASE_URL = 'http://169.254.169.254/2012-01-12';

function* getText(url) {
  var res = yield request.get(url).end();
  return res.text;
}

/**
Read AWS metadata and user-data to build a configuration for the worker.

@param {String} [baseUrl] optional base url override (for tests).
@return {Object} configuration values.
*/
module.exports = function* configure (baseUrl) {
  baseUrl = baseUrl || BASE_URL;

  // defaults per the metadata
  var config = yield {
    // Since this is aws configuration after all...
    provisionerId: 'aws-provisioner',
    workerId: getText(baseUrl + '/meta-data/instance-id'),
    workerType: getText(baseUrl + '/meta-data/ami-id'),
    workerGroup: getText(baseUrl + '/meta-data/placement/availability-zone'),
  };

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
