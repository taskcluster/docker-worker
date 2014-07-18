var TestWorker = require('./testworker');
var LocalWorker = require('./localworker');
var DockerWorker = require('./dockerworker');

module.exports = function* postTask(payload) {
  var worker = new TestWorker(DockerWorker);

  yield worker.launch();
  var result = yield worker.post(payload);
  yield worker.terminate();

  return result;
};
