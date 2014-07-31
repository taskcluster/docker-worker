/**
This module handles the creation of the "taskcluster" proxy container which
allows tasks to talk directly to taskcluster services over a http proxy which
grants a particular permission level based on the task scopes.
*/

// Alias used to link the proxy.
var ALIAS = 'taskcluster';

function TaskclusterProxy() {}

TaskclusterProxy.prototype = {
  /**
  Docker container used in the linking process.
  */
  container: null,

  link: function* (task) {
    var docker = task.config.docker;

    // Image name for the proxy container.
    var image = task.config.conf.get('taskclusterProxyImage');

    // create the container.
    this.container = yield docker.createContainer({
      Image: image,
      Cmd: []
    });

    // Terrible hack to get container promise proxy.
    this.container = docker.getContainer(this.container.id);

    var name = (yield this.container.inspect()).Name.slice(1);

    // TODO: In theory the output of the proxy might be useful consider logging
    // this somehow.
    yield this.container.start({});

    return [{ name: name, alias: ALIAS }];
  },

  killed: function*(task) {
    var stats = task.config.stats;
    yield stats.timeGen('tasks.time.killed_proxy', this.container.kill());
    yield stats.timeGen('tasks.time.removed_proxy', this.container.remove());
  }
};

module.exports = TaskclusterProxy;
