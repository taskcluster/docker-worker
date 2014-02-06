suite('buffer log test', function() {
  var amqp = require('../amqp')();
  var worker = require('../worker')();
  var runTask = require('../run_task')(amqp);

  var TaskFactory = require('taskcluster-task-factory/task');

  test('simple echo', function() {
    var task = TaskFactory.create({
      command: ['echo', 'first command!'],
      features: {
        buffer_log: true,
        azure_livelog: false
      },
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
