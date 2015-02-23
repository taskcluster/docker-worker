var fs = require('fs');
var taskcluster = require('taskcluster-client');
var DockerWorker = require('../dockerworker');
var TestWorker = require('../testworker');
var slugid = require('slugid');
var cmd = require('./helper/cmd');
var co = require('co');

suite('Cancel Task', function() {
  var jsonFromUrl = JSON.parse(fs.readFileSync('test/integration/cancelTaskReference.json'));

  test('cancel', co(function* () {
    var CancelQueue = taskcluster.createClient(jsonFromUrl);
    var queue = new CancelQueue({baseUrl: 'http://localhost:60001/v1'});
    var task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command:        [
          '/bin/bash', '-c', 'echo "Hello"; sleep 60; echo "done";'
        ],
        maxRunTime: 60 * 60
      }
    };
    var taskId = slugid.v4();
    var worker = new TestWorker(DockerWorker);
    worker.on('task run', co(function* () { yield queue.cancelTask(taskId); }));
    try {
      var launch = yield worker.launch();
      var result = yield worker.postToQueue(task, taskId);
      console.log("after post to queue");
      console.dir(result);
    }
    catch (e) {
      console.log('hi');
      console.log(e); 

    }
    yield worker.terminate();

  }));
});

