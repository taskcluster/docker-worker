import xml2js from 'xml2js';
import Debug from 'debug';
import request from 'superagent-promise';

let debug = Debug('taskcluster-docker-worker:queueService');

export default class TaskQueue {
  constructor(config) {
    this.queues;
    this.workerType = config.workerType;
    this.provisionerId = config.provisionerId;
    this.client = config.queue;
    this.log = config.log;
  }

  async getQueues() {
    if (!this.queues || (new Date(this.queues.expires)).getTime() > Date.now()) {
      this.queues = await this.client.pollTaskUrls(this.provisionerId, this.workerType);
    }
    return this.queues.queues;
  }

  async getTasksFromQueue(queue, numberOfTasks) {
    let tasks = [];
    let uri = `${queue.signedPollUrl}&numofmessages=${numberOfTasks}`;
    debug(`requesting: ${uri}`);
    let response = await request
      .get(uri)
      .buffer()
      .end();

    let xml = await new Promise((accept, reject) => {
      xml2js.parseString(response.text, (err, json) => {
        err ? reject(err) : accept(json)
      });
    });

    if(!xml.QueueMessagesList) { return tasks }

    for(let message of xml.QueueMessagesList.QueueMessage) {
      let payload = new Buffer(message.MessageText[0], 'base64').toString();
      let task = JSON.parse(payload);
      task.deleteUri = queue.signedDeleteUrl
       .replace('{{messageId}}', encodeURIComponent(message.MessageId[0]))
       .replace('{{popReceipt}}', encodeURIComponent(message.PopReceipt[0]));
      // If the task has been dequeued a lot, chances are the task is bad and should
      // be removed from the queue.
      let dequeueCount = parseInt(message.DequeueCount[0]);
      if (dequeueCount >=15) {
        this.log('[alert operator] task error', {
          taskId: task.taskId,
          runId: task.runId,
          message: `Task has been dequeued ${dequeueCount} times.  Deleting from queue.`
        });
        await this.deleteTaskFromQueue(task);
        continue;
      }

      tasks.push(task);
    }
    return tasks;
  }

  async deleteTaskFromQueue(task) {
    let error;
    let response;
    try {
      response = await request.del(task.deleteUri).end();
    }
    catch (e) {
      error = `Could not delete task from queue. ${e}`;
    }

    if (!response.ok) {
      error = response.error.message;
    }

    if (error) {
      throw new Error(error);
    }
  }
}
