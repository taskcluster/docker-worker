import Debug from 'debug';
import fs from 'mz/fs';
import path from 'path';
import Promise from 'promise';
import slugid from 'slugid';
import uploadToS3 from '../upload_to_s3';
import waitForEvent from '../wait_for_event';
import zlib from 'zlib';

let debug = Debug('docker-worker:features:docker-save');

export default class DockerSave {
  async killed (task) {
    //maybe add a way to specify this later
    let artifactName = 'private/dockerImage.tar'

    let pathname = path.join('/tmp', slugid.v4() + '.tar.gz');

    //entering options here could be a way to name images
    let {Id: imageId} = await task.dockerProcess.container.commit({
      repo: task.status.taskId + '/' + task.runId,
      // tag: task.status.taskId + '-' + task.runId
    });
    let image = task.runtime.docker.getImage(task.status.taskId + '/' + task.runId + ':latest');
    let imgStream = await image.get();
    let zipStream = zlib.createGzip();
    imgStream.pipe(zipStream).pipe(fs.createWriteStream(pathname));
    await waitForEvent(zipStream, 'end');
    debug('tar written');

    let stat = await fs.stat(pathname);
    debug(stat.size);
    let uploadStream = fs.createReadStream(pathname);

    await uploadToS3(task, uploadStream, artifactName, 60 * 1000, {
      'Content-Type': 'application/x-tar',
      'Content-Length': stat.size,
      'Content-Encoding': 'gzip'
    });

    debug('artifact uploaded');

    //cleanup
    fs.unlink(pathname);
    await image.remove();

    var queue = task.runtime.queue;

    return queue.buildUrl(
      queue.getArtifact,
      task.status.taskId,
      task.runId,
      artifactName
    );
  }
}
 