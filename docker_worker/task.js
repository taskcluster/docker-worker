var CREATE_CONFIG = {
  Hostname: '',
  User: '',
  AttachStdin: false,
  AttachStdout: true,
  AttachStderr: true,
  Tty: true,
  OpenStdin: false,
  StdinOnce: false
};

/**
Object which represents the task cluster definition
*/
function Task(def) {
  this.task = def;
}

Task.prototype = {

  /**
  Checks to see if the task has a particular feature
  @param {String} feature name.
  @param {Object} defaults value for the flag.
  @return {Object}
  */
  feature: function(feature, defaults) {
    var features = this.task.features || {};

    if (!(feature in features)) return defaults;
    return features[feature];
  },

  /**
  Docker create configuration based on the task definition.

  @return {Object}
  */
  createContainerConfig: function() {
    var cmd = this.task.command.join(' ');
    var taskDockerConfig = this.task.parameters.docker;

    var config = {
      Image: taskDockerConfig.image,
      Cmd: ['/bin/bash', '-c', cmd]
    };

    for (var key in CREATE_CONFIG) config[key] = CREATE_CONFIG[key];
    return config;
  },

  /**
  Start configuration based on the task definition.

  @return {Object}
  */
  startContainerConfig: function() {
    // nothing here yet
    return {};
  }
};

module.exports = Task;
