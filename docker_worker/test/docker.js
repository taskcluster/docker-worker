var URL = require('url'),
    Docker = require('dockerode-promise');


module.exports = function docker() {
  var host = process.env.DOCKER_PORT || process.env.DOCKER_HOST;
  var parts = URL.parse(host);
  console.log(host);
  return new Docker({
    host: 'http://' + parts.host,
    port: parts.port
  });
};
