var temporary = require('temporary');
var fs        = require('fs');
var request   = require('superagent');
var Promise   = require('promise');
var debug     = require('debug')('taskcluster-docker-worker:ArtifactLogger');

var LOGNAME = 'terminal-artifact.log';

/** Construct an instance of ArtifactLogger */
var ArtifactLogger = function() {
  this._file = new temporary.File();
  debug('Created ArtifactLogger using tempfile: ' + this._file.path);
};

/** Declare a log and  attach to stdout */
ArtifactLogger.prototype.declareLogs = function(logs, taskHandler) {
  var taskId = taskHandler.status.taskId;
  var queue = taskHandler.config.queue;
  var dockerProcess = taskHandler.dockerProcess;

  // Pipe stdout to temporary file
  this.stream = fs.createWriteStream(this._file.path);
  dockerProcess.stdout.pipe(this.stream);

  var urlRequest = {
    runId: taskHandler.claim.runId,
    workerGroup: taskHandler.config.workerGroup,
    workerId: taskHandler.config.workerId,
    artifacts: {}
  };

  urlRequest.artifacts[LOGNAME] = { contentType: 'text/plain' };

  // Fetch artifact PUT URLs
  var gotArtifactPutUrls = queue.requestArtifactUrls(taskId, urlRequest);

  // Add artifact URL to declared logs
  return gotArtifactPutUrls.then(function(result) {
    var artifacts = result.artifacts;
    logs[LOGNAME] = artifacts[LOGNAME].artifactUrl;
    return logs;
  });
};

/** Extract artifacts */
ArtifactLogger.prototype.extractResult = function(result, taskHandler) {
  var queue = taskHandler.config.queue;
  var that = this;
  var fileClosed = new Promise(
    function(accept, reject) {
      if (this.stream.closed)
        return accept();
      this.stream.once('close', accept);
      this.stream.once('error', reject);
    }.bind(this)
  );

  return fileClosed.then(function() {
    var taskId = taskHandler.status.taskId;
    var urlRequest = {
      runId: taskHandler.claim.runId,
      workerGroup: taskHandler.config.workerGroup,
      workerId: taskHandler.config.workerId,
      artifacts: {}
    };

    urlRequest.artifacts[LOGNAME] = { contentType: 'text/plain' };

    // Fetch artifact PUT URLs
    var gotArtifactPutUrls = queue.requestArtifactUrls(taskId, urlRequest);

      // Get log file size
    var gotLogSize = new Promise(function(accept, reject) {
      fs.stat(that._file.path, function(err, stat) {
        if (err) {
          return reject(err);
        }
        accept(stat.size);
      });
    });

    return Promise.all([gotArtifactPutUrls, gotLogSize]);
  }).then(function(val) {
    return new Promise(function(accept, reject) {
      var artifactUrls  = val.shift().artifacts;
      var size          = val.shift();


      var urls = artifactUrls[LOGNAME];
      var req = request
                  .put(urls.artifactPutUrl)
                  .set('Content-Type',    urls.contentType)
                  .set('Content-Length',  size);
      fs.createReadStream(that._file.path).pipe(req, {end: false});
      req.end(function(res) {
        if (!res.ok) {
          debug("Failed to upload " + LOGNAME);
          return reject(new Error("Upload of artifact log failed: " + res.text));
        }
        result.artifacts[LOGNAME] = urls.artifactUrl;
        accept();
      });
    });
  }).then(function() {
    return new Promise(function(accept, reject) {
      that._file.unlink(function(err) {
        if (err)
          return reject(err);
        accept();
      });
    });
  }).then(function() {
    return result;
  });
};

/** Create an instance of ArtifactLogger */
var ArtifactLogBuilder = function(flag) {
  return new ArtifactLogger();
};

ArtifactLogBuilder.featureFlagName    = 'artifactLog';
ArtifactLogBuilder.featureFlagDefault = false;

module.exports = ArtifactLogBuilder;
