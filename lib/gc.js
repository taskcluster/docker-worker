var co = require('co');

function isContainerStale(container) {
  var s = container['Status'];
  return (s.indexOf('Exited') !== -1 || !s);
}

function GarbageCollector(config) {
  // expects stats, log, docker instance
  for (var key in config) {
    this[key] = config[key];
  }
  this.markedContainers = {};
  this.retries = 5;
  this.scheduleSweep(this.interval);
}

GarbageCollector.prototype = {

  removeContainer: function (containerId) {
    this.markedContainers[containerId] = this.retries;
  },

  removeContainers: function* () {
    for (var containerId in this.markedContainers) {
      // If a container can't be removed after 5 tries, more tries won't help
      if (this.markedContainers[containerId] === 0) {
        delete this.markedContainers[containerId];
        continue;
      }

      var c = this.docker.getContainer(containerId);

      try {
        // Even running containers should be removed otherwise shouldn't have
        // been marked for removal.
        yield c.remove({force: true});
        delete this.markedContainers[containerId];
        this.log('container removed');
      } catch(e) {
        this.log('container removal error.', {err: e});
        this.markedContainers[containerId] -= 1;
      }
    }
  },

  markStaleContainers: function* () {
    var containers = yield this.docker.listContainers({all: true});
    containers.forEach(function (container) {
      if (isContainerStale(container)) {
        this.removeContainer(container.Id);
      }
    }.bind(this));
  },

  scheduleSweep: function (interval) {
    this.sweepTimeoutId = setTimeout(this.sweep.bind(this), interval);
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
