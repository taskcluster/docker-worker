var express = require('express');
var Promise = require('promise');

function getServer() {
  return new Promise(function(accept, reject) {
    var app = express();
    var server;

    function url(path) {
      var addr = server.address();
      return 'http://' + addr.address + ':' + addr.port + path;
    }

    app.endpoint = function(method, path, handler) {
      app[method](path, handler);
      return url(path);
    };

    app.once('error', reject);
    server = app.listen(0, function() {
      accept(app);
    });

  });
}

module.exports = getServer;
