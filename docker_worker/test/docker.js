var URL = require('url'),
    Docker = require('dockerode-promise');


module.exports = function docker() {
  var host = process.env.DOCKER_PORT;
  var parts = URL.parse(host);

  return new Docker({
    host: 'http://' + parts.host,
    port: parts.port
  });
};
