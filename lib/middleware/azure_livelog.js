var azure             = require('azure-storage');
var uuid              = require('uuid');
var BlobStream        = require('taskcluster-azure-blobstream');
var Promise           = require('promise');

/** Build an Azure live log middleware instance */
var AzureLiveLogBuilder = function() {
  return new AzureLiveLog();
};

function AzureLiveLog(flag) {
  // Rely on azure's werid environment variables for now to auth...
  this.blobService = azure.createBlobService();
  this.createContainer =
    Promise.denodeify(this.blobService.createContainerIfNotExists.bind(
      this.blobService
    ));
}

AzureLiveLog.prototype = {

  /**
  Ensure the azure container exists then create a new blob stream to pipe
  the docker output into.
  */
  declareLogs: function(logs, taskHandler) {
    var dockerProcess = taskHandler.dockerProcess;
    var container;
    var url;
    var path;

    // Build a human readable path for this live log.
    path = this.path =
      taskHandler.status.taskId + '/runs/' +
      taskHandler.claim.runId + '/terminal.log';

    // XXX: This needs to be configurable
    container = this.container = 'taskclusterlogs';
    url = this.url = this.blobService.getUrl(container, path);

    // add the log url to the logs so consumers can read from it immediately.
    logs['terminal.log'] = url;

    return this.createContainer(
      container,
      // list, get, etc... are public
      { publicAccessLevel: 'container' }
    ).then(
      function pipeToAzure() {
        this.stream = new BlobStream(this.blobService, container, path);
        dockerProcess.stdout.pipe(this.stream);
        return logs;
      }.bind(this)
    );
  },

  extractResult: function(result) {
    if (this.stream.closed) return result;

    return new Promise(
      function(accept, reject) {
        this.stream.once('close', accept.bind(null, result));
        this.stream.once('error', reject);
      }.bind(this)
    );
  }
};

AzureLiveLogBuilder.featureFlagName = 'azureLiveLog';
AzureLiveLogBuilder.featureFlagDefault = true;

module.exports = AzureLiveLogBuilder;
