#! /usr/bin/env node --harmony

var taskcluster = require('taskcluster-client');
var co = require('co');
var queue = new taskcluster.Queue();
var request = require('superagent-promise');

var PENDING = 'https://queue.taskcluster.net/v1/pending-tasks/aws-provisioner';
var workerType = process.argv[2];


co(function* () {
  var pending = (yield request.get(PENDING).end()).body.tasks;

  for (var i = 0; i < pending.length; i++) {
    var taskId = pending[i].taskId;
    var runId = pending[i].runs.length;
    var workerType = pending[i].workerType;

    if (workerType !== workerType) continue;

    console.log('begin claiming', taskId, runId);
    try { 
      var claim = yield queue.claimTask(taskId, runId, {
        workerGroup: 'skip',
        workerId: 'skip'
      });

      yield queue.reportCompleted(taskId, runId, false);
    } catch (e) {
      console.error("Could not complete %s %d", taskId, runId, e);
    }
  }

})(function(err) {
  if (err) throw err;
});
