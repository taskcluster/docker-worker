/**
 * Middleware for using the simple "ghetto" buffer
 */
var GhettoStream = require('../ghetto_stream');

function BufferLog() {
  var stream = new GhettoStream();

  return {
    start: function(taskHandler) {
      var proc = taskHandler.dockerProcess;
      proc.stdout.pipe(stream);
    },

    extractResult: function(result) {
      // stream as text output for our alpha version / debugging
      result.result.logText = stream.text;
      return result;
    }
  };
}

BufferLog.featureFlagName    = 'bufferLog';
BufferLog.featureFlagDefault = false;

module.exports = BufferLog;
