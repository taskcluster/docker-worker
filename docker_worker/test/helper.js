var envs = process.env;

// if there is no host try assigning it to DOCKER_HOST
if (!envs.DOCKER_PORT && envs.DOCKER_HOST) {
  console.log('DOCKER_PORT is missing using DOCKER_HOST instead');
  // DOCKER_HOST is in the form of IP:PORT where we want
  // PROTOCOL:IP:PORT so adjust it to include the tcp://.
  envs.DOCKER_PORT = 'tcp://' + envs.DOCKER_HOST;
}

if (!envs.DOCKER_PORT) {
  console.error('DOCKER_PORT is not present');
  process.exit(1);
}

global.assert = require('assert');

require('mocha-as-promised')();
