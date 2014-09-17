var co = require('co');
var EventEmitter = require('events').EventEmitter;
var diskspace = require('diskspace');
var Promise = require('promise');

function isContainerStale(container) {
  var s = container['Status'];
  return (s.indexOf('Exited') !== -1 || !s);
}

function exceedsDiskspaceThreshold(mnt, threshold, availableCapacity) {
  return new Promise(function (accept, reject) {
    diskspace.check(mnt, function (err, total, free, status) {
        accept(free <= (threshold * availableCapacity));
    });
  });
}

function GarbageCollector(config) {
  this.capacity = config.capacity;
  this.docker = config.docker;
  this.log = config.log;
  this.taskListener = config.taskListener;
  this.interval = config.interval || 60 * 1000;
  this.diskspaceThreshold = config.diskspaceThreshold || 10;

  this.markedContainers = {};
  this.ignoredContainers = [];
  this.retries = 5;
  this.scheduleSweep(this.interval);
  EventEmitter.call(this);
}

GarbageCollector.prototype = {
  __proto__: EventEmitter.prototype,

  removeContainer: function (containerId) {
    this.markedContainers[containerId] = this.retries;
    this.emit('gc:container:marked', containerId);
  },

  removeContainers: function* () {
    for (var containerId in this.markedContainers) {
      // If a container can't be removed after 5 tries, more tries won't help
      if (this.markedContainers[containerId] !== 0) {
        var c = this.docker.getContainer(containerId);

        try {
          // Even running containers should be removed otherwise shouldn't have
          // been marked for removal.
          yield c.remove({force: true});
          delete this.markedContainers[containerId];
          this.emit('gc:container:removed', containerId);
          this.log('container removed', {container: containerId});
        } catch(e) {
          this.emit('gc:error', {error: e, container: containerId});
          this.log('container removal error.',
                   {container: containerId, err: e});
          this.markedContainers[containerId] -= 1;
        }
      } else {
        delete this.markedContainers[containerId];
        this.ignoredContainers.push(containerId);
        this.emit('gc:error',
                  {error: 'Retry limit exceeded', container: containerId});
        this.log('container removal error',
                 {container: containerId, err: 'Retry limit exceeded'});
      }
    }
  },

  markStaleContainers: function* () {
    var containers = yield this.docker.listContainers({all: true});
    containers.forEach(function (container) {
      if (!(container.Id in this.markedContainers) &&
          (this.ignoredContainers.indexOf(container.Id) === -1) &&
          isContainerStale(container)) {
        this.removeContainer(container.Id);
      }
    }.bind(this));
  },

  scheduleSweep: function (interval) {
    this.sweepTimeoutId = setTimeout(this.sweep.bind(this), interval);
  },

  sweep: function () {
    clearTimeout(this.sweepTimeoutId);
    this.emit('gc:sweep:start');
    this.log('garbage collection started');
    co(function* () {
      yield this.markStaleContainers();
      yield this.removeContainers();
      try {
        console.log(yield exceedsDiskspaceThreshold('/',
                    this.diskspaceThreshold,
                    (this.capacity - this.taskListener.pending)
                   ));
      } catch(e) {
        throw e
      };
      this.log('garbage collection finished');
      this.emit('gc:sweep:stop');
    }).bind(this)();
    this.scheduleSweep(this.interval);
  }
};

module.exports = GarbageCollector;
