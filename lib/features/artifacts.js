/**
This module handles all of the "artifact" (as defined by the worker) uploads and
deals with the extract of both single and multiple artifacts from the docker
container.
*/

var waitForEvent = require('../wait_for_event');
var coPromise = require('co-promise');
var co = require('co');
var mime = require('mime');
var request = require('superagent-promise');
var tarStream = require('tar-stream');
var debug = require('debug')('docker-worker:middleware:artifact_extractor');
var Promise = require('promise');

function Artifacts() {}

Artifacts.prototype = {

  getPutUrl: function* (handler, path, expires, contentType) {
    var queue = handler.config.queue;
    var result = yield queue.createArtifact(
      handler.status.taskId,
      handler.runId,
      path,
      {
        // We have a bias for s3 but azure would work just as well...
        kind: 's3',
        expires: expires,
        contentType: contentType
      }
    );

    return result.putUrl;
  },

  uploadArtifact: function* (taskHandler, name, artifact) {
    var container = taskHandler.dockerProcess.container;
    var queue = taskHandler.config.queue;
    var path = artifact.path;
    var expiry = artifact.expires;

    // Task specific information needed to generated signed put requests.
    var taskId = taskHandler.status.taskId;
    var runId = taskHandler.claim.runId;
    var workerId = taskHandler.config.workerId;
    var workerGroup = taskHandler.config.workerGroup;

    // Raw tar stream for the content.
    try {
      var contentStream = yield container.copy({ Resource: path });
    } catch (e) {
      // Log the error...
      taskHandler.stream.write(taskHandler.fmtLog(
        'Artifact "%s" not found at path "%s" skipping.',
        name, path
      ));

      // Create the artifact but as the type of "error" to indicate it is
      // missing.
      yield queue.createArtifact(taskId, runId, name, {
        kind: 'error',
        expires: expiry,
        reason: 'file-missing-on-worker',
        message: 'Artifact not found in path: "' + path  + '"'
      });

      return;
    }

    var tarExtract = tarStream.extract();

    // Begin unpacking the tar.
    contentStream.pipe(tarExtract);

    // Get a signed url for the root of the package regaurdless of what we are
    // doing with it.
    var artifactManifest = {
      // Subpaths in the manifest.
      files: []
    };

    var ctx = this;

    // Individual tar entry.
    tarExtract.on('entry', co(function* (header, stream, callback) {
      // Trim the first part of the path off the entry.
      var entryName = name;
      var entryPath = header.name.split('/');
      entryPath.shift();
      if (entryPath.length && entryPath[0]) {
        entryName += '/' + entryPath.join('/');
      }

      var contentType = mime.lookup(header.name);
      var contentLength = header.size;
      var putUrl =
        yield ctx.getPutUrl(taskHandler, entryName, expiry, contentType);

      // Put the artifact on the server.
      var putReq = request.put(putUrl).set({
        'Content-Length': contentLength,
        'Content-Type': contentType
      });

      // Kick off the stream.
      putReq.end();

      // Looks weird but pipe should be after .end which creates the raw
      // request. Superagent does a bad job at this =/.
      stream.pipe(putReq.req);

      // Wait until the response is sent.
      var res = yield waitForEvent(putReq, 'response');

      // If there was an error uploading the artifact note that in the result.
      if (res.error) {
        taskHandler.stream.write(taskHandler.fmtLog(
          'Artifact "%s" failed to upload "%s" error code: %s',
          name,
          header.name,
          res.status
        ));
      }

      // Wait until the requset is fuly completed.
      yield waitForEvent(putReq, 'end');
    }));

    // Wait for the tar to be finished extracting.
    yield waitForEvent(tarExtract, 'finish');
  },

  stopped: function* (taskHandler) {
    var queue = taskHandler.config.queue;
    var artifacts = taskHandler.task.payload.artifacts;

    // Upload all the artifacts in parallel.
    yield Object.keys(artifacts).map(function(key) {
      return this.uploadArtifact(taskHandler, key, artifacts[key]);
    }, this);
  }

};

module.exports = Artifacts;
