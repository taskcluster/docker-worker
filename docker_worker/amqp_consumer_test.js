suite('consumer', function() {
  var amqp = require('./test/amqp')();
  var worker = require('./test/worker')();
  var runTask = require('./test/run_task')(amqp);

  var TaskFactory = require('taskcluster-task-factory/task');

  test('successful task', function() {
    var task = TaskFactory.create({
      command: ['echo', 'first command!'],
      parameters: {
        docker: { image: 'ubuntu' }
      }
    });

    return runTask(task).then(
      function(taskStatus) {
        assert.ok(taskStatus.claimed);
        var result = taskStatus.finish.result;

        assert.ok(result.extra_info.log.indexOf('first command') !== -1);
        assert.equal(result.task_result.exit_status, 0);
      }
    );
  });
});
