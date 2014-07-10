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
        // Let the consumer know the graph file cannot be found.
        taskHandler.stream.write(taskHandler.fmtLog(
          'Graph extension not found at path "%s" skipping...',
          extensionPath
        ))
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
          taskHandler.stream.write(taskHandler.fmtLog(
            'Unexpected multiple files in task graph extension path'
          ));
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
        taskHandler.stream.write(taskHandler.fmtLog(
          'Invalid json in taskgraph extension path: "%s" dumping file...'
        ));
        taskHandler.stream.write(entryJSON)
        return;
      }

      // Extend the graph!
      // TODO: Add logging to indicate task graph extension...
      try {
        var result = yield scheduler.extendTaskGraph(graphId, extension);
        taskHandler.stream.write(taskHandler.fmtLog(
          'Successfully extended graph id: "%s" with "%s".',
          result.status.taskGraphId, extensionPath
        ));
      } catch(e) {
        taskHandler.stream.write(taskHandler.fmtLog(
          'Graph server error while extending task graph: %s.'
        ));
        return;
      }
    });
  }
};

TaskGraphExtensionBuilder.featureFlagName    = 'extendTaskGraph';
TaskGraphExtensionBuilder.featureFlagDefault = true;

module.exports = TaskGraphExtensionBuilder;
