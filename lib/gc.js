var co = require('co');

function GarbageCollector(config) {
  // expects stats, log, docker instance
  for (var key in config) {
    this[key] = config[key]
  }
  this.markedContainers = {};
  this.retries = 5;
  this.sweepTimeoutId = setTimeout( function () {
    this.sweep();
  }.bind(this), this.interval * 1000);
}

GarbageCollector.prototype = {
  // TODO unmarked containers that are stopped and old
  removeContainer: function (containerId) {
    this.markedContainers[containerId] = this.retries;
  },
  removeContainers: function () {
      co(function* () {
        clearTimeout(this.sweepTimeoutId);
        for (var containerId in this.markedContainers) {
          this.markedContainers[containerId] -= 1;

          if (this.markedContainers[containerId] === 0) {
            delete this.markedContainers[containerId];
            continue;
          }

          var c = this.docker.getContainer(containerId);
          try {
            yield c.remove();
            this.log('container removed');
            delete this.markedContainers[containerId];
          } catch(e) {
            this.log('container removal error');
          }
        }
      this.sweepTimeoutId = setTimeout( function () {
        this.sweep();
      }.bind(this), this.interval * 1000);
    }).bind(this)();
  },

  sweep: function () {
    this.log('garbage collection started');
    this.removeContainers();
    this.log('garbage collection finished');
  }
};
module.exports = GarbageCollector;
