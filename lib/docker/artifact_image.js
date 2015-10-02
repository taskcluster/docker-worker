import {createHash} from 'crypto';
import Debug from 'debug';
import fs from 'mz/fs';
import slugid from 'slugid';
import {Transform} from 'stream';
import path from 'path';
import request from 'superagent';
import tarfs from 'tar-fs';
import taskcluster from 'taskcluster-client';
import { scopeMatch } from 'taskcluster-base/utils';

import {makeDir, removeDir} from '../util/fs';
import { fmtLog, fmtErrorLog } from '../log';
import downloadArtifact from '../util/artifact_download';
import sleep from '../util/sleep';

let debug = Debug('docker-worker:artifactImage');

const IMAGE_SCOPE_PREFIX = "queue:get-artifact:";

/*
 * Image manager for task artifact images.
 */
export default class ArtifactImage {
  /*
   * @param {Object}  runtime       - Runtime object
   * @param {Object}  imageDetails  - Type, namespace, and path object
   * @param {Object}  stream        - task stream object
   * @param {Array}   taskScopes        - Array of task scopes
   */
  constructor(runtime, imageDetails, stream, taskScopes=[]) {
    this.runtime = runtime;
    this.taskScopes = taskScopes;
    this.stream = stream;
    this.taskId = imageDetails.taskId;
    this.artifactPath = imageDetails.path;
    this.queue = new taskcluster.Queue({
      credentials: this.runtime.taskcluster,
      authorizedScopes: this.taskScopes
    });
  }

  /*
   * Verifies that the task is authorized to use the image.  Authorization is
   * only required for non-public artifacts (those not prefixed iwth "public/"
   *
   * @returns {Boolean}
   */
  isAuthorized() {
    if (/^[/]?public\//.test(this.artifactPath)) {
      return true;
    }

    return scopeMatch(this.taskScopes, [[`queue:get-artifact:${this.artifactPath}`]]);
  }


  /* Downloads an image at the given task ID and path.
   *
   * @returns {Object} - Image details
   */
  async download() {
    if (this.imageId) {
      return this.imageId;
    }

    return await this._downloadArtifact();
  }

  async _downloadArtifact() {
    let downloadDir = path.join(this.runtime.dockerVolume, 'tmp-docker-images', slugid.nice());
    await makeDir(downloadDir);

    let originalTarball = path.join(downloadDir, 'image.tar');

    let newTarball;
    try {
      this.stream.write(
        fmtLog(`Downloading image "${this.artifactPath}" from task ID: ${this.taskId}.`)
      );
      await downloadArtifact(
        this.queue,
        this.stream,
        this.taskId,
        this.artifactPath,
        originalTarball,
        this.runtime.dockerConfig
      );

    } catch(e) {
      await removeDir(downloadDir);
      throw new Error(`Error loading docker image. ${e.message}`);
    }

    newTarball = await this.renameImageInTarball(this.imageName, originalTarball);
    await this.runtime.docker.loadImage(newTarball);

    await removeDir(downloadDir);

    for (let i = 0; i <= 2; i++) {
      let pulledImage = await this.imageExists();

      if (pulledImage) {
        return pulledImage;
      }

      await sleep(10000);
    }

    throw new Error('Image could not be found after downloading');
  }

  /*
   * Creates a md5 hash of the image details to be used for uniquely identifying
   * this image when saving/loading within docker.
   *
   * @returns {String} - md5 hashed image name
   */
  get imageName() {
    return createHash('md5')
             .update(`${this.taskId}${this.artifactPath}`)
             .digest('hex');

  }

  async _checkIfImageExists() {
    try {
      let image = await this.runtime.docker.getImage(this.imageName);
      let imageDetails = await image.inspect();
      this.imageId = imageDetails.Id;

      this.stream.write(fmtLog(
        `Image '${this.artifactPath}' from task '${this.taskId}' ` +
        `downloaded.  Using image ID ${this.imageId}.`
      ));

      return imageDetails;
    } catch(e) {
      return false;
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
    return await this._checkIfImageExists(this.imageName);
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
      throw new Error('Task images must only contain one image per tar file');
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
