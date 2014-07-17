/** Create an instance of ArtifactExtractor */
var coPromise = require('co-promise');
var co = require('co');
var mime = require('mime');
var request = require('superagent-promise');
var tarStream = require('tar-stream');
var debug = require('debug')('docker-worker:middleware:artifact_extractor');
var Promise = require('promise');

function eventPromise(listener, event) {
  return new Promise(function(accept, reject) {
    listener.on(event, function(message) {
      accept(message);
    });
  });
}

var ArtifactExtractorBuilder = function(flag) {
  return new ArtifactExtractor();
};

function ArtifactExtractor() {}

ArtifactExtractor.prototype = {

  putArtifact: function* (taskHandler, name, path) {
    var container = taskHandler.dockerProcess.container;
    var queue = taskHandler.config.queue;

    // Raw tar stream for the content.
    try {
      var contentStream = yield container.copy({ Resource: path });
    } catch (e) {
      // Log the error...
      taskHandler.stream.write(taskHandler.fmtLog(
        'Artifact "%s" not found at path "%s" skipping.',
        name, path
      ));

      // Mark the artifact as missing.
      return {
        error: {
          message: 'Artifact missing from container or unable to be copied.'
        }
      };
    }

    var tarExtract = tarStream.extract();

    // Begin unpacking the tar.
    contentStream.pipe(tarExtract);

    // Task specific information needed to generated signed put requests.
    var taskId = taskHandler.status.taskId;
    var runId = taskHandler.claim.runId;
    var workerId = taskHandler.config.workerId;
    var workerGroup = taskHandler.config.workerGroup;

    function* signRequest(name, contentType) {
      var signReq = {
        runId: runId,
        workerId: workerId,
        workerGroup: workerGroup,
        artifacts: {}
      };

      signReq.artifacts[name] = { contentType: contentType };

      var res = (yield queue.requestArtifactUrls(taskId, signReq));
      return res.artifacts[name];
    }

    // Get a signed url for the root of the package regaurdless of what we are
    // doing with it.
    var artifactManifest = {
      // Subpaths in the manifest.
      files: []
    };

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
      var artifactReq =
        yield signRequest(entryName, contentType);

      // Root url of the artifacts for this name.
      if (!artifactManifest.url) {
        // Differentate between files and directories (+ save room for other
        // kinds of non file/directory artifacts).
        artifactManifest.type = header.type;

        // The very first entry is always the path that the user specified so it
        // is considered the "root" url of the artifact (even if it was a
        // directory).
        artifactManifest.url = artifactReq.artifactUrl;
      }

      // We can't upload non-files so stop here and move to the next item.
      if (header.type !== 'file') {
        return stream.resume();
      }

      // Record the file as a path in the artifact.
      artifactManifest.files.push(entryName.replace(name + '/', ''));

      // Put the artifact on the server.
      var putReq = request.
        put(artifactReq.artifactPutUrl).
        set('Content-Length', contentLength).
        set('Content-Type', contentType);

      // Kick off the stream.
      putReq.end();

      // Looks weird but pipe should be after .end which creates the raw
      // request. Superagent does a bad job at this =/.
      stream.pipe(putReq.req);

      // Wait until the response is sent.
      var res = yield eventPromise(putReq, 'response');

      // If there was an error uploading the artifact note that in the result.
      if (res.error) {
        taskHandler.stream.write(taskHandler.fmtLog(
          'Artifact "%s" failed to upload "%s" error code: %s',
          name,
          header.name,
          res.status
        ));

        // Note we do not abort anything we just note the erorr and continue.
        artifactManifest.error = {
          message: 'Failed to upload artifact'
        };
      }

      // Wait until the requset is fuly completed.
      yield eventPromise(putReq, 'end');
    }));

    // Wait for the tar to be finished extracting.
    yield eventPromise(tarExtract, 'finish');

    return artifactManifest;
  },

  extractResult: function (result, taskHandler) {
    var queue = taskHandler.config.queue;
    var self = this;
    return coPromise(function* () {
      var artifacts = taskHandler.task.payload.artifacts;
      if (!artifacts) {
        result.artifacts = {};
        return result;
      }

      // Upload all artifacts in parallel.
      var artifactResults = {};

      for (var key in artifacts) {
        // `co` will resolve the generator results in parallel.
        artifactResults[key] =
          self.putArtifact(taskHandler, key, artifacts[key]);
      }

      // Resolve generator calls.
      result.artifacts = yield artifactResults;
      return result;
    });
  }
};

ArtifactExtractorBuilder.featureFlagName    = 'extractArtifacts';
ArtifactExtractorBuilder.featureFlagDefault = true;

module.exports = ArtifactExtractorBuilder;
