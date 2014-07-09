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

function* drain (listener) {
  var buffer = '';

  listener.on('data', function(data) {
    buffer += data;
  });

  yield eventPromise(listener, 'end');
  return buffer;
}

var TaskGraphExtensionBuilder = function(flag) {
  return new TaskGraphExtension();
};

function TaskGraphExtension() {}

TaskGraphExtension.prototype = {

  extractResult: function (result, taskHandler) {
    return coPromise(function* () {
      var task = taskHandler.task;
      var graphId = task.metadata.taskGraphId;
      var extensionPath = task.payload.extendTaskGraph;

      // Obviously if this task is not part of a graph we can't extend it.
      if (!graphId) return;

      // If there is no extensionPath we have nothing to do.
      if (!extensionPath) return;

      var container = taskHandler.dockerProcess.container;
      var scheduler = taskHandler.config.scheduler;

      // Raw tar stream for the content.
      try {
        var contentStream = yield container.copy({ Resource: extensionPath });
      } catch (e) {
        // TODO: Add logging to indicate failure in the worker stream.

        // Log the error...
        debug('Error extracting task graph extension', {
          path: extensionPath, name: name, taskId: taskHandler.status.taskId
        });

        return;
      }

      var tarExtract = tarStream.extract();

      // Begin unpacking the tar.
      contentStream.pipe(tarExtract);

      // Individual tar entry.
      var expectingEntry = true;
      var entryJSON;
      tarExtract.on('entry', co(function* (header, stream) {
        if (!expectingEntry) {
          // TODO: Add to task log.
          debug('Unexpected multiple files in task graph extension path', {
            taskId: taskHandler.status.taskId,
            path: extensionPath
          })
          return stream.resume();
        }

        // Consume the stream and store the raw json here.
        entryJSON = yield drain(stream);
      }));

      // Wait for the tar to be finished extracting.
      yield eventPromise(tarExtract, 'finish');

      // Parse the json to ensure it is valid on our end.
      var extension;
      try {
        extension = JSON.parse(entryJSON);
      } catch (e) {
        debug('Invalid json when trying to extend task graph', {
          taskId: taskHandler.status.taskId,
          path: extensionPath
        });
        return;
      }

      // Extend the graph!
      // TODO: Add logging to indicate task graph extension...
      try {
        yield scheduler.extendTaskGraph(graphId, extension);
      } catch(e) {
        debug('Error while extending task graph', {
          error: e.toString(),
          taskId: taskHandler.status.taskId,
          path: extensionPath
        });
        return;
      }
    });
  }
};

TaskGraphExtensionBuilder.featureFlagName    = 'extendTaskGraph';
TaskGraphExtensionBuilder.featureFlagDefault = true;

module.exports = TaskGraphExtensionBuilder;
