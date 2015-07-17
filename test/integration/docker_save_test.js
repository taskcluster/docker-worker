import assert from 'assert';
import base from 'taskcluster-base'
import Debug from 'debug';
import Docker from 'dockerode-promise';
import DockerWorker from '../dockerworker';
import fs from 'mz/fs';
import https from 'https';
import request from 'superagent-promise';
import TestWorker from '../testworker';
import zlib from 'zlib';

let debug = Debug('docker-worker:test:docker-save-test');

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
        command: ['/bin/sh', '-c', 'echo testString > /tmp/test.log'],
        features: {
          dockerSave: true
        },
        maxRunTime: 5 * 60
      }
    });

    assert(result.run.state === 'completed', 'task should be successful');
    assert(result.run.reasonResolved === 'completed',
                 'task should be successful');

    let taskId = result.taskId;
    let runId = result.runId;

    let signedUrl = worker.queue.buildSignedUrl(
      worker.queue.getLatestArtifact,
      taskId,
      'private/dockerImage.tar',
      {expiration: 60 * 5});

    //superagent was only downlading 16K of data
    //TODO: work on error handling here
    await new Promise((accept, reject) => {
      https.request(signedUrl, (res) => { //take the redirect
        https.request(res.headers.location, (res) => {
          let unzipStream = zlib.Gunzip();
          res.pipe(unzipStream).pipe(fs.createWriteStream('/tmp/dockerload.tar'));
          unzipStream.on('end', accept);
          res.on('error', (err) => reject(err));
        }).end();
        res.on('error', (err) => reject(err));
      }).end();
    });

    //maybe there's a better way to get the docker obj than making a new one
    let docker = new Docker();
    await docker.loadImage('/tmp/dockerload.tar');
    let opts = {
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['/bin/sh'],
      Image: taskId + '/' + runId + ':latest'
    };
    let streamOpts = {
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true
    }
    let container = await docker.createContainer(opts);
    await container.start();
    debug(container);
    let stream = await container.attach(streamOpts);
    debug(stream);
    stream.on('data', (data) => {
      debug(data);
    });
    stream.write('cat /tmp/test.log\n');
    await base.testing.sleep(10000);
  });
});
