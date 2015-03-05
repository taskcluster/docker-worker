import xml2js from 'xml2js';
import Debug from 'debug';
import request from 'superagent-promise';
import denodeify from 'denodeify';
import assert from 'assert';

const parseXmlString = denodeify(xml2js.parseString.bind(xml2js));

let debug = Debug('taskcluster-docker-worker:queueService');

/**
 * Create a task queue that will poll for queues that could contain messages and
 * claim work based on the available capacity of the worker.
 *
 * config:
 * {
 *   workerType:        // Worker type for this worker
 *   provisionerID:     // ID of the provisioner used for this worker
 *   queue:             // Queue instance as provided by taskcluster-client
 *   log:               // Logger instance
 *   task: {
 *     dequeueCount:    // Times a task should be dequeued before permanently
 *                      // removing from the queue.
 *   }
 *   taskQueue: {
 *     expiration: // Time in milliseconds used to determine if the
 *                      // queues should be refreshed
 *   }
 * }
 *
 */
export default class TaskQueue {
  constructor(config) {
    assert(config.workerType, 'Worker type is required');
    assert(config.provisionerId, 'Provisioner ID is required');
    assert(config.queue, 'Instance of taskcluster queue is required');
    assert(config.log, 'Logger is required');
    assert(config.task.dequeueCount, 'Dequeue count is required');
    assert(config.taskQueue.expiration, 'Queue expiration time in miliseconds is required');
    this.queues;
    this.workerType = config.workerType;
    this.provisionerId = config.provisionerId;
    this.client = config.queue;
    this.log = config.log;
    this.dequeueCount = config.task.dequeueCount;
    this.queueExpiration = config.taskQueue.expiration;
  }

  /**
   * Return the queues that messages can be retrieved from.  Refresh the list
   * of queues if the queue expiration is within the configured expiration window.
   *
   * @returns {Array} queues - List of queues that contains signed urls for retrieving
   *                           and deleting messages
   *
   */
  async getQueues() {
    // If queue url expiration is within `expiration` then refresh the queues
    // to reduce risk of using an expired url
    let expiration = Date.now() + this.queueExpiration;
    if (!this.queues || (expiration > new Date(this.queues.expires).getTime())) {
      this.queues = await this.client.pollTaskUrls(this.provisionerId, this.workerType);
    }
    return this.queues.queues;
  }

  /**
   * Retrieves a particular number of tasks from a queue.
   *
   * @param {Object} queue - Queue object that contains signed urls
   * @param {Number} numberOfTasks - The number of tasks that should be retrieved
   */
  async getTasksFromQueue(queue, numberOfTasks) {
    let tasks = [];
    let uri = `${queue.signedPollUrl}&numofmessages=${numberOfTasks}`;
    debug(`requesting: ${uri}`);
    let response = await request
      .get(uri)
      .buffer()
      .end();

    let xml = await parseXmlString(response.text);

    if(!xml.QueueMessagesList) return [];

    for(let message of xml.QueueMessagesList.QueueMessage) {
      let payload = new Buffer(message.MessageText[0], 'base64').toString();
      payload = JSON.parse(payload);

      // Construct a delete URL for each message based on the delete URL returned
      // from polling for queue urls. Each URL is unique to each message in the queue
      // based on message ID and pop Receipt.  This URL will be called when a
      // message needs to be removed from the queue.
      payload.deleteUri = queue.signedDeleteUrl
       .replace('{{messageId}}', encodeURIComponent(message.MessageId[0]))
       .replace('{{popReceipt}}', encodeURIComponent(message.PopReceipt[0]));

      // If the message has been dequeued a lot, chances are the message is bad and should
      // be removed from the queue and not claimed.
      let dequeueCount = parseInt(message.DequeueCount[0]);
      if (dequeueCount >= this.dequeueCount) {
        this.log('[alert operator] task error', {
          taskId: payload.taskId,
          runId: payload.runId,
          message: `Message has been dequeued ${dequeueCount} times.  Deleting from queue.`
        });
        await this.deleteTaskFromQueue(payload);
        continue;
      }

      tasks.push(payload);
    }
    return tasks;
  }

  /**
   * Deletes a specific task from the queue
   *
   * @param {Object} task - Task to remove from the queue
   */
  async deleteTaskFromQueue(task) {
    let response;
    try {
      response = await request.del(task.deleteUri).end();
    }
    catch (e) {
      throw new Error(`Could not delete task from queue. Raw Error: \n ${e.stack}`);
    }

    if (response.error) throw new Error(response.error.message);
  }
}
