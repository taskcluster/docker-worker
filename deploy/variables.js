/**
To deploy the worker we need a number of "variables" which are used to construct
various config files. This contains the list of all variables used in the deploy
process with their description and default values... This is used in the
interactive mode of the deploy process...
*/
module.exports = {
  debugLevel: {
    description: 'Debug level for worker (see debug npm module)',
    value: '*'
  },
  taskclusterClientId: {
    description: 'Taskcluster client id',
    value: process.env.TASKCLUSTER_CLIENT_ID
  },
  taskclusterAccessToken: {
    description: 'Taskcluster access token',
    value: process.env.TASKCLUSTER_ACCESS_TOKEN
  },
  statsdPrefix: {
    description: 'statsd prefix token',
    value: process.env.STATSD_PREFIX
  },
  statsdHost: {
    description: 'statsd hostname endpoint',
  },
  statsdPort: {
    description: 'statsd port endpoint',
  },
  logglyAccount: {
    description: 'Loggly account name',
  },
  logglyAuth: {
    description: 'Loggly authentication token',
  },
  fsType: {
    description: 'Docker filesystem type (aufs, btrfs)',
    value: 'aufs'
  },
  papertrail: {
    description: 'Papertrail host + port'
  }
};
