import assert from 'assert';
import base from 'taskcluster-base'
import Debug from 'debug';
import Docker from 'dockerode-promise';
import dockerOpts from 'dockerode-options';
import DockerWorker from '../dockerworker';
import fs from 'mz/fs';
import https from 'https';
import request from 'superagent-promise';
import TestWorker from '../testworker';
import zlib from 'zlib';

var debug = Debug('docker-worker:test:docker-save-test');

suite('use docker-save', () => {
  var worker;
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
    var result = await worker.postToQueue({
      payload: {
        image: 'busybox',
        command: ['/bin/sh', '-c', 'echo testString > /tmp/test.log'],
        features: {
          dockerSave: {artifactPath: 'public/heyy.tar'}
        },
        maxRunTime: 5 * 60
      }
    });

    assert(result.run.state === 'completed', 'task should be successful');
    assert(result.run.reasonResolved === 'completed',
                 'task should be successful');

    var taskId = result.taskId;
    var runId = result.runId;

    var signedUrl = worker.queue.buildSignedUrl(
      worker.queue.getLatestArtifact,
      taskId,
      'public/heyy.tar',
      {expiration: 60 * 5});

    try {
      //superagent was only downlading 16K of data
      await new Promise((accept, reject) => {
        https.request(signedUrl, (res) => { //take the redirect
          https.request(res.headers.location, (res) => {
            var unzipStream = zlib.Gunzip();
            res.pipe(unzipStream).pipe(fs.createWriteStream('/tmp/dockerload.tar'));
            unzipStream.on('end', accept);
            res.on('error', (err) => reject(err));
          }).end();
          res.on('error', (err) => reject(err));
        }).end();
      });
    } catch (e) {
      throw new Error('download from s3 failed' + taskId);
    }
    try {
      var docker = new Docker(dockerOpts());
    } catch (e) {
      throw new Error('couldnt make docker' + taskId);
    }
    try {
      var imageName = 'task/' + taskId + '/' + runId + ':latest';
      await docker.loadImage('/tmp/dockerload.tar');
      var opts = {
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Cmd: ['cat', '/tmp/test.log'],
        Image: imageName
      };
      var streamOpts = {
        logs: true,
        stdout: true,
      };
      var container = await docker.createContainer(opts);
      await container.start();
      var stream = await container.attach(streamOpts);
      var finished = false;
      stream.on('data', (data) => {
        assert(data.compare(new Buffer(0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x0b, //header
          0x74,0x65,0x73,0x74,0x53,0x74,0x72,0x69,0x6e,0x67,0x0a))); //testString\n
        finished = true;
      });
      await base.testing.sleep(3000);
      assert(finished, 'did not receive any data back');
      await Promise.all([container.remove(), fs.unlink('/tmp/dockerload.tar')]);
      await docker.getImage(imageName).remove();
    } catch (e) {
      throw new Error('couldnt do docker things' + taskId);
    }
  });
});
