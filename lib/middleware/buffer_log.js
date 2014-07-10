/**
 * Middleware for using the simple "ghetto" buffer
 */
var GhettoStream = require('../ghetto_stream');
var Promise = require('promise');

function BufferLog() {
  var stream = new GhettoStream();

  function finalize(result) {
    result.result.logText = stream.text;
  }

  return {
    start: function(taskHandler) {
      var proc = taskHandler.dockerProcess;
      proc.stdout.pipe(stream);
    },

    extractResult: function(result) {
      if (stream.closed) {
        return finalize(result);
      }

      return new Promise(
        function(accept, reject) {
          stream.once('finish', function() {
            accept(finalize(result));
          });
          stream.once('error', reject);
        }.bind(this)
      );
    }
  };
}

BufferLog.featureFlagName    = 'bufferLog';
BufferLog.featureFlagDefault = false;

module.exports = BufferLog;
