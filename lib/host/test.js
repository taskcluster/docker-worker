var fs = require('fs');
var settingsPath = require('../../test/settings').settingsPath;

function* billingCycleRemaining() {
  var path = settingsPath('billingCycleRemaining');
  return parseInt(fs.readFileSync(path), 10);
}

function* configure() {
  var path = settingsPath('configure');
  return JSON.parse(fs.readFileSync(path, 'utf8'))
}

module.exports.billingCycleRemaining = billingCycleRemaining;
module.exports.configure = configure;
