var fs = require('fs');
var settingsPath = require('../../test/settings').settingsPath;

function* billingCycleUptime() {
  var path = settingsPath('billingCycleUptime');
  return parseInt(fs.readFileSync(path), 10);
}

function* billingCycleInterval() {
  var path = settingsPath('billingCycleInterval');
  return parseInt(fs.readFileSync(path), 10);
}

function* configure() {
  var path = settingsPath('configure');
  return JSON.parse(fs.readFileSync(path, 'utf8'))
}

module.exports.configure = configure;
module.exports.billingCycleInterval = billingCycleInterval;
module.exports.billingCycleUptime = billingCycleUptime;
