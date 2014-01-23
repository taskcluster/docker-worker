var URL = require('url'),
    Docker = require('dockerode-promise'),
    dockerOpts = require('dockerode-options');

module.exports = function docker() {
  // DOCKER_PORT is setup by linking the dind docker image to the tests
  return new Docker(dockerOpts(process.env.DOCKER_PORT));
};
