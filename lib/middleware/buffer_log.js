/**
 * Middleware for using the simple "ghetto" buffer
 */
var GhettoStream = require('../ghetto_stream');
var Promise = require('promise');

function BufferLog() {
  var stream = new GhettoStream();

  function finalize(result) {
    result.result.logText = stream.text;
    return result;
  }

  return {
    start: function(taskHandler) {
      taskHandler.stream.pipe(stream);
    },

    finalizeLogs: function(result) {
      if (stream._writableState.ended) {
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
