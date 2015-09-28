import {createHash} from 'crypto';
import Debug from 'debug';
import fs from 'mz/fs';
import slugid from 'slugid';
import {Transform} from 'stream';
import path from 'path';
import request from 'superagent';
import tarfs from 'tar-fs';
import taskcluster from 'taskcluster-client';

import {makeDir, removeDir} from '../util/fs';
import { fmtLog, fmtErrorLog } from '../log';

let debug = Debug('docker-worker:indexedImage');

/*
 * Image manager for indexed images.
 */
export default class IndexedImage {
  /*
   * @param {Object}  runtime       - Runtime object
   * @param {Object}  imageDetails  - Type, namespace, and path object
   * @param {Object}  stream        - task stream object
   * @param {Array}   scopes        - Array of task scopes
   */
  constructor(runtime, imageDetails, stream, scopes=[]) {
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

  /* Downloads an image that is indexed at the given namespace and path.
   *
   * @returns {Object} - Image details
   */
  async download() {
    if (this.imageId) {
      return this.imageId;
    }

    let taskId = await this.getTaskIdForImage();
    let imageName = await this.getImageName();

    let downloadDir = path.join(this.runtime.dockerVolume, 'tmp-docker-images', slugid.nice());
    await makeDir(downloadDir);

    let originalTarballPath = path.join(downloadDir, slugid.nice() + '.tar');

    let newTarball;
    try {
      await this.downloadArtifact(taskId, this.artifactPath, originalTarballPath);

      newTarball = await this.renameImageInTarball(imageName, originalTarballPath);
      await this.runtime.docker.loadImage(newTarball);

      await removeDir(downloadDir);
    } catch(e) {
      await removeDir(downloadDir);
      throw new Error(`Error loading docker image. ${e.message}`);
    }

    let pulledImage = await this.imageExists();

    if (!pulledImage) {
      throw new Error('image missing after pulling');
    }

    return pulledImage;
  }

  /*
   * Downloads an artifact for a particular task and saves it locally.
   *
   * @param {String} taskId - ID of the task
   * @param {String} artifactPath - Path to find the artifact for a given task
   * @param {String} tarballPath - Path to store the file locally
   */
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

  /*
   * Creates a md5 hash of the image details to be used for uniquely identifying
   * this image when saving/loading within docker.
   *
   * @returns {String} - md5 hashed image name
   */
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

  /*
   * Retrieves a task ID for a given indexed namespace.
   *
   * @returns {String} taskId - ID of the indexed task.
   */
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

  /*
   * Checks to see if the image has already been downloaded and loaded into
   * docker.
   *
   * @returns {Boolean|Object} Returns false if image does not exist, or an object
   *                           containing image details if it does.
   */
  async imageExists() {
    let imageName = await this.getImageName();
    try {
      let image = await this.runtime.docker.getImage(imageName);
      let imageDetails = await image.inspect();
      this.imageId = imageDetails.Id;

      this.stream.write(fmtLog(
        `Indexed image ${this.artifactPath} for ` +
        `"${this.namespace}" already downloaded.  Using image ID ${this.imageId}.`
      ));

      return imageDetails;
    } catch(e) {
      return false;
    }
  }

  /*
   * Given a docker image tarball, the repositories file within the tarball
   * will be overwritten with a unique name used for tagging the image when calling
   * 'docker load'
   *
   * @param {String} imageName - New name of the image
   * @param {String} tarballPath - Path to the docker image tarball
   *
   * @returns {String} Path to the new tarball
   */
  async renameImageInTarball(imageName, tarballPath) {
    let dir = path.dirname(tarballPath);
    let filename = path.basename(tarballPath, '.tar');
    let editedTarballPath = path.join(dir, filename + '-edited.tar');

    let extractStream = tarfs.extract(path.join(dir, filename), {
      mapStream: (fileStream, header) => {
        if (header.name === 'repositories') {
          let transform = new RepoTransform({objectMode: true}, imageName);
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

    // TODO remove files as we go
    return editedTarballPath;
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
