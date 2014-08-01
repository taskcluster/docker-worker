/**
The docker worker has a number of features all of which are optional and can be
enabled/disabled at will... This module defines the list of features and which
module is responsible for handling them.
*/

module.exports = {
  // the structure is [name] = { defaults: true/false, module: Handler }
  liveLog: {
    defaults: true,
    module: require('./features/live_log')
  },

  bulkLog: {
    defaults: false,
    module: require('./features/bulk_log')
  },

  taskclusterProxy: {
    defaults: true,
    module: require('./features/taskcluster_proxy')
  },

  artifacts: {
    defaults: true,
    module: require('./features/artifacts')
  }
};
