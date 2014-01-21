var envs = process.env;
var host = envs.DOCKER_PORT || envs.DOCKER_PORT;

if (!host) {
  console.error('DOCKER_HOST is not present');
  process.exit(1);
}

global.assert = require('assert');

require('mocha-as-promised')();
