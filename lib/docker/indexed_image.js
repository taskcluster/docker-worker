import { createHash } from 'crypto';
import Debug from 'debug';
import fs from 'fs';
import slugid from 'slugid';
import { Transform } from 'stream';
import path from 'path';
import request from 'superagent';
import tarfs from 'tar-fs';
import taskcluster from 'taskcluster-client';

import sleep from '../util/sleep';

let debug = Debug('docker-worker:indexedImage');

export default class IndexedImage {
  constructor(runtime, imageDetails, scopes, stream) {
    this.runtime = runtime;
    this.scopes = scopes;
    this.stream = stream;
    this.namespace = imageDetails.namespace;
    this.artifactPath = imageDetails.path;
    this.index = new taskcluster.Index({
      credentials: this.runtime.taskcluster,
      authorizedScopes: this.scopes
    });
    this.queue = new taskcluster.Queue({
      credentials: this.runtime.taskcluster,
      authorizedScopes: this.scopes
    });

  }

  async getTaskIdForImage() {
    if (this.taskId) {
      return this.taskId;
    }

    try {
      let {taskId} = await this.index.findTask(this.namespace);
      return taskId;
    } catch(e) {
      throw new Error(
        `Could not find a task associated with "${this.namespace}" ` +
        `namespace. ${e.message}`
      );
    }
  }

  async getImageName() {
    if (this.imageName) {
      return this.imageName;
    }

    let taskId = await this.getTaskIdForImage();

    this.imageName = createHash('md5')
                        .update(`${taskId}${this.artifactPath}`)
                        .digest('hex');

    return this.imageName;
  }

  async downloadArtifact(taskId, artifactPath, tarballPath) {
    let url = this.queue.buildUrl(
        this.queue.getLatestArtifact,
        taskId,
        this.artifactPath
    );

    // TODO add some retry mechanism
    try {
      let req = request.get(url);
      req.pipe(fs.createWriteStream(tarballPath));

      await new Promise((accept, reject) => {
        req.on('end', accept);
        req.on('error', reject);
      });

      if (req.res.statusCode !== 200) {
        throw new Error(req.res.statusMessage);
      }
    } catch(e) {
      throw new Error(
        `Could not download image artifact "${this.artifactPath} from ` +
        `task "${taskId}". ${e.message}`
      );
    }
  }

  async renameImageInTarball(imageName, tarballPath) {
    let dir = path.dirname(tarballPath);
    let filename = path.basename(tarballPath, '.tar');
    let editedTarballPath = path.join(dir, filename + '-edited.tar');

    let extractStream = tarfs.extract(path.join(dir, filename), {
      mapStream: (fileStream, header) => {
        if (header.name === 'repositories') {
          let transform = new RepoTransform({ objectMode: true }, imageName);
          return fileStream.pipe(transform);
        }
        return fileStream;
      }
    });
    let fileStream = fs.createReadStream(tarballPath);
    fileStream.pipe(extractStream);

    await new Promise((accept, reject) => {
      fileStream.on('end', accept);
      fileStream.on('error', reject);
    });

    let pack = tarfs.pack(path.join(dir, filename));
    pack.pipe(fs.createWriteStream(editedTarballPath));
    await new Promise((accept, reject) => {
      pack.on('end', accept);
      pack.on('error', reject);
    });

    return editedTarballPath;
  }

  async download() {
    if (this.imageId) {
      return this.imageId;
    }

    let taskId = await this.getTaskIdForImage();
    let imageName = await this.getImageName();

    // TODO change path where we store these so they can be remove on GC
    let originalPath = path.join(this.runtime.dockerVolume, slugid.nice());
    let originalTarballPath = originalPath + '.tar';
    let editedTarballPath = path.join(this.runtime.dockerVolume, slugid.nice() + '.tar');

    await this.downloadArtifact(taskId, this.artifactPath, originalTarballPath);

    // TODO remove
    await sleep(10000);

    let newTarball = await this.renameImageInTarball(imageName, originalTarballPath);
    await this.runtime.docker.loadImage(newTarball);

    let pulledImage = await this.imageExists();

    if (!pulledImage) {
      throw new Error('image missing after pulling');
    }

    return pulledImage;
  }

  async imageExists() {
    let imageName = await this.getImageName();
    let imageDetails;
    try {
      let image = await this.runtime.docker.getImage(imageName);
      imageDetails = await image.inspect();
      this.imageId = imageDetails.Id;
    } catch(e) {
      imageDetails = false;
    }

    return imageDetails;
  }
}

class RepoTransform extends Transform {
  constructor(opts, imageName) {
    super(opts);
    this.contents = '';
    this.imageName = imageName;
  }

  _transform (chunk, encoding, cb) {
    let data = chunk.toString();
    this.contents += data;
    cb();
  }

  _flush (cb) {
    let repoInfo = JSON.parse(this.contents);

    if (Object.keys(repoInfo) > 1) {
      throw new Error('Indexed images must only contain one image per tar file');
    }

    let oldRepoName = Object.keys(repoInfo)[0];
    // TODO tag that is not 'latest'
    let newRepoInfo = {};
    newRepoInfo[this.imageName] = repoInfo[oldRepoName];
    newRepoInfo = JSON.stringify(newRepoInfo);
    this.push(newRepoInfo);
    cb();
  }
}
