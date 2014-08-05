var co = require('co');
var Queue = require('taskcluster-client').Queue;

co(function* () {
  var taskId = process.argv[2];
  var runId = process.argv[3];

  if (!taskId) {
    console.error('Required task id...')
    console.log('usage: %s <taskId> [runId]', process.argv[1]);
    return;
  }

  console.log('completing task: %s', taskId);
  var queue = new Queue();

  var claim = yield queue.claimTask(taskId, {
    workerId: 'local',
    workerGroup: 'local'
  });

  var res = yield queue.reportTaskCompleted(taskId, {
    runId: runId || 1,
    success: false,
    workerGroup: 'local',
    workerId: 'local'
  });
  console.dir(res);
})(function(err) {
  if (err) throw err;
});
