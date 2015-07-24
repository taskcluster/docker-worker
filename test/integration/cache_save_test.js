import assert from 'assert';
import base from 'taskcluster-base'
import Docker from 'dockerode-promise';
import dockerOpts from 'dockerode-options';
import DockerWorker from '../dockerworker';
import fs from 'mz/fs';
import https from 'https';
import request from 'superagent-promise';
import TestWorker from '../testworker';
import zlib from 'zlib';
// import Debug from 'debug';

// let debug = Debug('docker-worker:test:docker-save-test');

suite('use docker-save', () => {
  let worker;
  setup(async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });

  teardown(async () => {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
  });

  test('run, then check contents', async () => {
    let result = await worker.postToQueue({
      payload: {
        image: 'busybox',
        command: ['/bin/sh', '-c', 'echo testString > /tmp/test-cache/test.log'],
        features: {
          cacheSave: true
        },
        maxRunTime: 5 * 60,
        cache: {
          'test-cache': '/tmp/test-cache'
        }
      }
    });

    assert(result.run.state === 'completed', 'task should be successful');
    assert(result.run.reasonResolved === 'completed',
                 'task should be successful');

    let taskId = result.taskId;
    let runId = result.runId;

  });
});