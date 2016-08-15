/**
The bulk logger writes the task stream directly to disk then uploads that file
to s3 after the task has completed running.
*/
import crypto from 'crypto';
import stream from 'stream';
import * as openpgp from 'openpgp';
import Debug from 'debug';
import fs from 'mz/fs'
import streamClosed from '../stream_closed';
import temporary from 'temporary';
import uploadToS3 from '../upload_to_s3';
import zlib from 'zlib';

let debug = Debug('taskcluster-docker-worker:features:cot');

export default class CertificateOfTrust {
  constructor() {
    this.featureName = 'certificateOfTrust';
  }

  async created(task) {
    this.hash = crypto.createHash('sha256');
    let armoredKey = fs.readFileSync(task.runtime.signingKeyLocation, 'ascii');
    this.key = openpgp.key.readArmored(armoredKey).keys;

    this.file = new temporary.File();

    // Pipe the task stream to a temp file on disk.
    this.stream = fs.createWriteStream(this.file.path);
    task.stream.on('data', (d) => {
      this.hash.update(d);
    });

    let gzip = zlib.createGzip();
    task.stream.pipe(gzip).pipe(this.stream);
  }

  async killed(task) {
    if (task.isCanceled()) return;

    // Ensure the stream is completely written prior to uploading the temp file.
    await streamClosed(this.stream);

    let expiration = new Date(task.task.expires);

    // Open a new stream to read the entire log from disk (this in theory could
    // be a huge file).
    let stat = await fs.stat(this.file.path);
    let logStream = fs.createReadStream(this.file.path);

    try {
      await uploadToS3(task.queue, task.status.taskId, task.runId,
                       logStream, 'public/logs/certified.log', expiration, {
        'content-type': 'text/plain',
        'content-length': stat.size,
        'content-encoding': 'gzip'
      });
    } catch (err) {
      debug(err);
      // Unlink the temp file.
      await fs.unlink(this.file.path);
      throw err;
    }

    // Unlink the temp file.
    await fs.unlink(this.file.path);

    let artifact = {name: 'public/logs/certified.log', hash: `sha256:${this.hash.digest('hex')}`};
    task.artifactHashes.push(artifact);

    let certificate = {
      artifacts: task.artifactHashes,
      task: task.task,
      taskId: task.status.taskId,
      runId: task.status.runId,
      workerGroup: task.runtime.workerGroup,
      workerId: task.runtime.workerId,
      extra: {
        publicIpAddress: task.runtime.publicIp,
        imageHash: task.imageHash
      }
    };

    let signedCertificate = await openpgp.sign({
      data: JSON.stringify(certificate),
      privateKeys: this.key
    });

    // Initiate a buffer stream to read from when uploading
    var bufferStream = new stream.PassThrough();
    bufferStream.end(new Buffer(signedCertificate.data));

    try {
      await uploadToS3(task.queue, task.status.taskId, task.runId,
                       bufferStream, 'public/certificate.gpg', expiration, {
        'content-type': 'text/plain',
        'content-length': signedCertificate.data.length
      });
    } catch (err) {
      debug(err);
      throw err;
    }
  }

}
