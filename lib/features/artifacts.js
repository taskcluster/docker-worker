/**
This module handles all of the "artifact" (as defined by the worker) uploads and
deals with the extract of both single and multiple artifacts from the docker
container.
*/

var waitForEvent = require('../wait_for_event');
var _ = require('lodash');
var mime = require('mime');
var tarStream = require('tar-stream');
var debug = require('debug')('docker-worker:middleware:artifact_extractor');
var Promise = require('promise');
var uploadArtifact = require('../upload_to_s3');

export default class Artifacts {
  async uploadArtifact(taskHandler, name, artifact) {
    var errors = [];
    var container = taskHandler.dockerProcess.container;
    var queue = taskHandler.runtime.queue;
    var path = artifact.path;
    var expiry = new Date(artifact.expires);

    // Task specific information needed to generated signed put requests.
    var taskId = taskHandler.status.taskId;
    var runId = taskHandler.claim.runId;

    // Raw tar stream for the content.
    var contentStream;
    try {
      contentStream = await (new Promise((accept, reject) => {
        return container.copy({Resource: path}, (err, data) => {
          if (err) reject(err);
          accept(data);
        });
      }));
    } catch (e) {
      let error = `Artifact "${name}" not found at "${path}"`;
      // Log the error...
      taskHandler.stream.write(taskHandler.fmtLog(error));

      // Create the artifact but as the type of "error" to indicate it is
      // missing.
      await queue.createArtifact(taskId, runId, name, {
        storageType: 'error',
        expires: expiry,
        reason: 'file-missing-on-worker',
        message: error
      });

      throw new Error(error);
    }

    var tarExtract = tarStream.extract();

    // Begin unpacking the tar.
    contentStream.pipe(tarExtract);

    var checkedArtifactType = false;

    var entryHandler = async function (header, stream, cb) {
      // Trim the first part of the path off the entry.
      var entryName = name;
      var entryPath = header.name.split('/');
      entryPath.shift();
      if (entryPath.length && entryPath[0]) {
        entryName += '/' + entryPath.join('/');
      }

      // The first item in the tar should always match the intended artifact
      // type.
      if (!checkedArtifactType) {
        // Only check once! Tar is ordered and docker gives us consistent
        // contents so we do not need to check more then once.
        checkedArtifactType = true;
        if (header.type !== artifact.type) {
          let error =
            `Error uploading "${entryName}". Expected artifact to ` +
            `be a "${artifact.type}" but was "${header.type}"`;

          taskHandler.stream.write(taskHandler.fmtLog(error));
          errors.push(error);

          // Remove the entry listener immediately so no more entries are consumed
          // while uploading the error artifact.
          tarExtract.removeListener('entry', entryHandler);

          // Make it clear that you must expected either files or directories.
          await queue.createArtifact(taskId, runId, name, {
            storageType: 'error',
            expires: expiry,
            reason: 'invalid-resource-on-worker',
            message: error
          });

          // Destroy the stream.
          tarExtract.destroy();

          // Notify the 'finish' listener that we are done.
          tarExtract.emit('finish');

          return;
        }
      }

      // Skip any entry type that is not an artifact for uploads...
      if (header.type !== 'file') {
        stream.resume();
        cb();
        return;
      }

      let headers = {
        'content-type': mime.lookup(header.name),
        'content-length': header.size
      };

      try {
        await uploadArtifact(taskHandler, stream, entryName, expiry, headers);
      } catch(err) {
        debug(err);
        // Log each error but don't throw yet.  Try to upload as many artifacts as
        // possible before handling the errors.
        errors.push(err);
        taskHandler.stream.write(
          taskHandler.fmtLog(`Error uploading "${entryName}" artifact. ${err}`)
        );
      }
      // Resume the stream if there is an upload failure otherwise
      // stream will never emit 'finish'
      stream.resume();
      cb();
    };

    // Individual tar entry.
    tarExtract.on('entry', entryHandler);

    // Wait for the tar to be finished extracting.
    await waitForEvent(tarExtract, 'finish');

    if (errors.length) {
      throw new Error(errors.join(' | '));
    }
  }

  async stopped(taskHandler) {
    // Can't create artifacts for a task that's been canceled
    if (taskHandler.isCanceled()) return;

    var artifacts = taskHandler.task.payload.artifacts;
    var errors = {};

    // Artifacts are optional...
    if (typeof artifacts !== 'object') return;

    // Upload all the artifacts in parallel.
    await Promise.all(_.map(artifacts, (value, key) => {
      return this.uploadArtifact(taskHandler, key, value).catch((err) => {
        errors[key] = err;
      });
    }));

    if (Object.keys(errors).length) {
      _.map(errors, (value, key) => {
        debug('Artifact upload %s failed, %s, as JSON: %j', key, value, value, value.stack);
      });
      throw new Error(`Artifact uploads ${Object.keys(errors).join(', ')} failed`);
    }
  }
}
