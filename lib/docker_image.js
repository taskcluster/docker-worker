import { createHash } from 'crypto';
import Debug from 'debug';
import fs from 'fs';
import dockerUtils from 'dockerode-process/utils';
import parseImage from 'docker-image-parser';
import path from 'path';
import request from 'superagent';
import slugid from 'slugid';
import taskcluster from 'taskcluster-client';

import { scopeMatch } from 'taskcluster-base/utils';
import sleep from './util/sleep';
import waitForEvent from './wait_for_event';

let debug = Debug('docker-worker:dockerImage');

//
// This string was super long but I wanted to say all these thing so I broke it
// out into a constant even though most errors are closer to their code...
// TODO error message is specific to docker registry (what abaout indexed artifact?)
export const IMAGE_ERROR = 'Pulling docker image "%s" has failed. This may indicate an ' +
                  'error with the registry, image name, or an authentication error. ' +
                  'Try pulling the image locally to ensure image exists. %s';

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

export class DockerImage {
  constructor(runtime, imageName, stream, scopes=[]) {
    this.runtime = runtime;
    this.imageName = imageName;
    this.stream = stream;
    this.scopes = scopes;

    var parsed = parseImage(imageName);
    this.name = parsed.repository;
    // Default to using the 'latest' tag if none specified to avoid pulling the
    // entire repository. Consistent with `docker run` defaults.
    this.tag = parsed.tag || 'latest';
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

        // Ensure image downloaded after pulling. This is mostly for multiple tasks
        // pulling at the same time, only one will pull the image while the others wait.
        // Even if the pull failed by the client that was pulling, the stream ends without
        // error for the other clients because they are done waiting.
        let pulledImage = await docker.getImage(image);
        pulledImage = await pulledImage.inspect();

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
      if (registryHost + '/' === registry || registryHost == registry) {
        result = repositories[registry];
      }
    }

    return result;
  }
};


export class IndexedImage {
  constructor(runtime, imageDetails, scopes, stream) {
    this.runtime = runtime;
    this.scopes = scopes;
    this.stream = stream;
    this.namespace = imageDetails.namespace;
    this.artifactPath = imageDetails.path;
    this.fullName = createHash('md5').update(`${this.namespace} - ${this.artifactPath}`).digest('hex');
  }

  async download() {
    /*
     * this.fullname === indexed name
     * query index for last indexed artifact with name
     * download and retry to temp location
     * docker load
     * remove temp file
     */

    let index = new taskcluster.Index({
      credentials: this.runtime.taskcluster
    });

    let url = index.buildUrl(
        index.findArtifactFromTask,
        this.namespace,
        // TODO query the task to find the aritfact name
        this.artifactPath
    );

    try {
      /*
      let pathname = path.join(this.runtime.dockerVolume, slugid.v4() + '.tar');
      debug(pathname);
      let stream = fs.createWriteStream(pathname);
      let req = request.get(url);
      req.pipe(stream);

      await new Promise((accept, reject) => {
        req.on('end', accept);
        req.on('error', reject);
      });

      debug(3)
      */

      let done = await this.runtime.docker.loadImage(path.join('/tmp', 'evnaKahARh2b0NxML8zJHw.tar'));
      console.log(done);

      let pulledImage = await this.runtime.docker.getImage(this.fullName);
      pulledImage = await pulledImage.inspect();
    } catch(e) {
      console.log(e.stack);
      throw e;
    }

    if (!pulledImage) {
      throw new Error('image missing after pulling');
    }
  }
}
