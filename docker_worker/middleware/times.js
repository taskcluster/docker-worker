/**
Times middleware keeps track of the starting and ending times of a task.
*/
var Times = function(flag) {
  // This middleware should always be on, regardless of the flag given
  var started;
  return {
    start: function(claim, value) {
      started = Date.now();
      return claim;
    },

    stop: function(value) {
      value.startTimestamp = started;
      value.stopTimestamp = Date.now();
      return value;
    }
  };
};

Times.featureFlagName    = 'times';
Times.featureFlagDefault = true;

module.exports = Times;
