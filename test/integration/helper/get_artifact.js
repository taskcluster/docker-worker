var get = require('./get');

/**
Fetch the contents of a single artifact.

@param {Object} result from `.postToQueue` and similar.
@param {String} path path to fetch artifact from.
@return {String} full contents of the artifact.
*/
module.exports = function* getArtifact(result, path) {
  var taskId = result.taskId;
  var runId = result.runId;

  var url = 'http://localhost:60001/v1/task/' +
            taskId + '/runs/' + runId + '/artifacts/' + path;
  console.log("get artifact: "+url);

  return yield get(url);
}
