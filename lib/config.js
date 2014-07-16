module.exports = function loadConfig() {
  // test is default otherwise use production.
  var env = process.env.NODE_ENV === 'test' ? 'test' : 'production';
  var finalConfig = {};

  var defaults = require('../config/defaults');
  var config = require('../config/' + env);

  for (var key in config) finalConfig[key] = config[key];
  for (var key in defaults) {
    if (finalConfig[key]) continue;
    finalConfig[key] = defaults[key];
  }
  return finalConfig;
}
