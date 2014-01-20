var URL = require('url'),
    Docker = require('dockerode-promise');

module.exports = function docker() {
  var parts = URL.parse(process.env.DOCKER_HOST);
  return new Docker({
    host: 'http://' + parts.host,
    port: parts.port
  });
};
