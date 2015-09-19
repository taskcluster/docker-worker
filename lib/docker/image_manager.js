import assert from 'assert';
import { createHash } from 'crypto';
import { DockerImage, IndexedImage } from '../docker_image';

export default class ImageManager {
  constructor(runtime) {
    assert(runtime.docker, 'Docker instance must be provided');
    this.runtime = runtime;
    this.docker = runtime.docker;
    this.log = runtime.log || process.stdout.write;
    this._imagesLoaded = {};
    this._lastImageEnsured = null;
  }

  async _loadImage(tempfile) {
    throw new Error('Not yet implemented');
  }

  async _resolveToUrl(imageDetails) {
    throw new Error('Not yet implemented');
  }

  async downloadImage(url) {
    throw new Error('Not yet implemented');
  }

  getImageHash(details) {
    return createHash('md5').update(details.source+details.type).digest('hex');
  }

  getReadableImageName(details) {
    if (typeof imageDetails === 'string') {
      imageDetails = {
        source: imageDetails,
        type: 'image-id'
      };
    }

    return `${imageDetails.type} - ${imageDetails.source}`;
  }

  async ensureImage(imageDetails, stream, scopes = []) {
    if (typeof imageDetails === 'string') {
      imageDetails = {
        source: imageDetails,
        type: 'image-id'
      };
    }

    return this._lastImageEnsured = Promise.resolve(this._lastImageEnsured)
      .catch(() => {}).then(async () => {
        let imageHash = this.getImageHash(imageDetails);
        if (!this._imagesLoaded[imageHash]) {
          let image = await this.pullImage(imageDetails.source, stream, scopes);
          this._imagesLoaded[imageHash] = image.Id;
        }

        return this._imagesLoaded[imageHash];
      });
  }

  async pullImage(image, stream, scopes) {
    let handler;
    if (image.type === 'image-id') {
      handler = new DockerImage(this.runtime, imageName, stream, scopes);
    } else {
      handler = new IndexedImage(this.runtime, image, stream scopes);
    }

    return await handler.download();
  }
}
