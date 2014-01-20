if (!('DOCKER_HOST' in process.env)) {
  console.error('DOCKER_HOST is not present');
  process.exit(1);
}

global.assert = require('assert');

require('mocha-as-promised')();
