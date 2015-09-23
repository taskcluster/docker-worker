import { Transform } from 'stream';
import { createHash } from 'crypto';
import Debug from 'debug';
import fs from 'fs';
import dockerUtils from 'dockerode-process/utils';
import parseImage from 'docker-image-parser';
import path from 'path';
import request from 'superagent';
import slugid from 'slugid';
import taskcluster from 'taskcluster-client';
import tar from 'tar-stream';
import tarfs from 'tar-fs';

import { scopeMatch } from 'taskcluster-base/utils';
import sleep from './util/sleep';
import waitForEvent from './wait_for_event';

let debug = Debug('docker-worker:dockerImage');

// Prefix used in scope matching for authenticated docker images.
const IMAGE_SCOPE_PREFIX = 'docker-worker:image:';
//
// Settings for exponential backoff for retrying image pulls.
// Last attempt will be in a range between 6 and 10 minutes which is acceptable
// for an image pull.
const RETRY_CONFIG = {
  maxAttempts: 5,
  delayFactor: 15 * 1000,
  randomizationFactor: 0.25
};

function removeFiles(filesPath) {
  return new Promise(function(accept, reject) {
    rmrf(filesPath, function (error) {
      if (error) return reject(error);
      accept(error);
    });
  });
}

export class DockerImage {
  constructor(runtime, imageDetails, stream, scopes=[]) {
    this.runtime = runtime;
    this.imageName = imageDetails.name;
    this.stream = stream;
    this.scopes = scopes;

    var parsed = parseImage(this.imageName);
    this.name = parsed.repository;
    // Default to using the 'latest' tag if none specified to avoid pulling the
    // entire repository. Consistent with `docker run` defaults.
    this.tag = parsed.tag || 'latest';
  }

  async imageExists() {
    let imageDetails;
    try {
      let image = await this.runtime.docker.getImage(this.imageName);
      imageDetails = await image.inspect();
      this.imageId = imageDetails.Id;
    } catch(e) {
      imageDetails = false;
    }

    return imageDetails;
  }

  getImageName() {
    return this.imageName;
  }

  async download() {
    let dockerImageName = this.fullName;
    let pullOptions = {
      retryConfig: this.runtime.dockerConfig
    };

    if (this.canAuthenticate()) {
      // See if any credentials apply from our list of registries...
      let defaultRegistry = this.runtime.dockerConfig.defaultRegistry;
      let credentials = this.credentials(this.runtime.registries, defaultRegistry);
      if (credentials) {
        // Validate scopes on the image if we have credentials for it...
        if (!scopeMatch(this.scopes, [[IMAGE_SCOPE_PREFIX + dockerImageName]])) {
          throw new Error(
            'Insufficient scopes to pull : "' + dockerImageName + '" try adding ' +
            IMAGE_SCOPE_PREFIX + dockerImageName + ' to the .scopes array.'
          );
        }

        // TODO: Ideally we would verify the authentication before allowing any
        // pulls (some pulls just check if the image is cached) the reason being
        // we have no way to invalidate images once they are on a machine aside
        // from blowing up the entire machine.
        pullOptions.authconfig = credentials;
      }
    }

    return await this.pullImageStreamTo(this.runtime.docker,
                                        dockerImageName,
                                        this.stream,
                                        pullOptions);
  }

  async pullImageStreamTo(docker, image, stream, options={}) {
    let config = options.retryConfig || RETRY_CONFIG;
    let attempts = 0;

    while (attempts++ < config.maxAttempts) {
      debug('pull image. Image: %s Attempts: %s', image, attempts);
      let downloadProgress =
        dockerUtils.pullImageIfMissing(docker, image, options);

      downloadProgress.pipe(stream, {end: false});

      try {
        await new Promise((accept, reject) => {
          downloadProgress.once('error', reject);
          downloadProgress.once('end', accept);
        });

        let pulledImage = await this.imageExists();

        if (!pulledImage) {
          throw new Error('image missing after pulling');
        }

        return pulledImage;
      } catch (err) {
        if (attempts >= config.maxAttempts) {
          throw new Error(err);
        }

        let delay = Math.pow(2, attempts - 1) * config.delayFactor;
        let randomizationFactor = config.randomizationFactor;
        delay = delay * (Math.random() * 2 * randomizationFactor + 1 - randomizationFactor);
        debug(
          'pull image failed Next Attempt in: %s ms. Image: %s. %s, as JSON: %j',
          delay,
          image,
          err,
          err.stack
        );

        await sleep(delay);
      }
    }
  }

  /**
  Return full image path including tag.
  */
  get fullName() {
    return this.name + (this.tag ? ':' + this.tag : '');
  }

  /**
  Determine if we should attempt to authenticate against this image name... The
  image will not be considered something to authenticate against unless it has
  three parts: <host>/<user>/<image>. Note this does not mean you cannot
  authenticate against docker you just need to prefix the default path with:
  `registry.hub.docker.com`.

  @return {Boolean}
  */
  canAuthenticate() {
    var components = this.name.split('/').filter(function(part) {
      // strip empty parts...
      return !!part;
    });

    return components.length === 2 || components.length === 3;
  }

  /**
  Attempt to find credentials from within an object of repositories.

  @return {Object|null} credentials or null...
  */
  credentials(repositories, defaultRegistry='') {
    // We expect the image to be be checked via imageCanAuthenticate first.
    // This could be user/image or host/user/image.  If only user/image, use
    // default registry
    var parts = this.name.split('/');
    if (parts.length === 2) parts.unshift(defaultRegistry);

    var registryHost = parts[0];
    var registryUser = parts[1];
    var result;

    // Note this may search through all repositories intentionally as to only
    // match the correct (longest match based on slashes).
    for (var registry in repositories) {

      // Longest possible match always wins fast path return...
      if (registryHost + '/' + registryUser === registry) {
        return repositories[registry];
      }

      // Hold on to partial matches but we cannot use these as the final values
      // without exhausting all options...
      if (registryHost + '/' === registry || registryHost === registry) {
        result = repositories[registry];
      }
    }

    return result;
  }
}

export class IndexedImage {
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
