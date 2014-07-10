/**
Times middleware keeps track of the starting and ending times of a task.
*/
var Times = function(flag) {
  // This middleware should always be on, regardless of the flag given
  var started;
  return {
    start: function(value) {
      started = new Date();
      return value;
    },

    extractResult: function(result) {
      result.statistics.started = started.toJSON();
      result.statistics.finished = new Date().toJSON();
      return result;
    }
  };
};

Times.featureFlagName    = 'times';
Times.featureFlagDefault = true;

module.exports = Times;
