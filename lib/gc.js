var co = require('co');

function GarbageCollector(config) {
  // expects stats, log, docker instance
  for (var key in config) {
    this[key] = config[key]
  }
  this.markedContainers = {};
  this.retries = 5;
  this.scheduleSweep(this.interval);
}

GarbageCollector.prototype = {
  isContainerStale: function (container) {
    var s = container['Status'];
    return (s.indexOf('Exited') !== -1 || !s)
  },

  removeContainer: function (containerId) {
    this.markedContainers[containerId] = this.retries;
  },

  removeContainers: function* () {
      for (var containerId in this.markedContainers) {
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
          this.markedContainers[containerId] -= 1;
        }
      }
  },

  markStaleContainers: function* () {
    var containers = yield this.docker.listContainers({all: true});
    containers.filter(this.isContainerStale).map(function (container) {
      this.removeContainer(container.Id);
    }.bind(this));
  },

  scheduleSweep: function (interval) {
    this.sweepTimeoutId = setTimeout( function () {
      this.sweep();
    }.bind(this), interval * 1000);
  },

  sweep: function () {
    clearTimeout(this.sweepTimeoutId);
    this.log('garbage collection started');
    co(function* () {
      yield this.markStaleContainers();
      yield this.removeContainers();
      this.log('garbage collection finished');
    }).bind(this)();
    this.scheduleSweep(this.interval);
  }
};

module.exports = GarbageCollector;
