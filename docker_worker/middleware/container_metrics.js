var ContainerMetrics = require('../metrics/container');

/** Middleware tracking container metric on task level */
var Metrics = function(flag) {
  if (!flag) {
    return null;
  }
  var handler = new ContainerMetrics('tasks');
  return {
    start: function(start, task, dockerProc) {
      handler.metrics.job = task.data;

      dockerProc.once('container start', function(container) {
        handler.poll(container);
      });

      return start;
    },

    stop: function(stop) {
      handler.stop();
      return stop;
    }
  };
};

Metrics.featureFlagName    = 'metrics';
Metrics.featureFlagDefault = false;

module.exports = Metrics;
