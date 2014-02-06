/**
Times middleware keeps track of the starting and ending times of a task.
*/
function Times() {
  var started;
  return {
    start: function(value) {
      started = Date.now();
      return value;
    },

    end: function(value) {
      var times = value.times = {};
      times.started_timestamp = started;
      times.finished_timestamp = Date.now();
      times.runtime_seconds =
        (times.finished_timestamp - times.started_timestamp) / 1000;

      return value;
    }
  };
}

module.exports = Times;
