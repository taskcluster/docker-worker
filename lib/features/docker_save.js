import Debug from 'debug';
import fs from 'mz/fs';
import path from 'path';
import Promise from 'promise';
import taskcluster from 'taskcluster-client';
import slugid from 'slugid';
import uploadToS3 from '../upload_to_s3';
import waitForEvent from '../wait_for_event';
import zlib from 'zlib';

let debug = Debug('docker-worker:features:docker-save');

export default class DockerSave {
  async killed (task) {
    //temporary path for saved file
    let pathname = path.join('/tmp', slugid.v4() + '.tar.gz');

    let {Id: imageId} = await task.dockerProcess.container.commit({
      repo: 'task/' + task.status.taskId + '/' + task.runId
    });
    let image = task.runtime.docker.getImage('task/' + task.status.taskId + '/' + task.runId + ':latest');
    let imgStream = await image.get();
    let zipStream = zlib.createGzip();
    imgStream.pipe(zipStream).pipe(fs.createWriteStream(pathname));
    await new Promise((accept, reject) => {
      zipStream.on('end', accept);
      zipStream.on('error', (error) => reject(error));
    });
    debug('tar written');

    let stat = await fs.stat(pathname);
    debug(stat.size);
    let uploadStream = fs.createReadStream(pathname);
    let expiration = taskcluster.fromNow(task.runtime.dockerSave.expiration);

    await uploadToS3(task, uploadStream, 'public/dockerImage.tar.gz', expiration, {
      'content-type': 'application/x-tar',
      'content-length': stat.size,
      'content-encoding': 'gzip'
    });

    debug('artifact uploaded');

    //cleanup
    fs.unlink(pathname).catch(() => {
      task.runtime.log('[alert-operator] could not delete cache save tarball, worker may run out of hdd space\r\n'
        + err + err.stack);
    });
    await image.remove();
  }
}
