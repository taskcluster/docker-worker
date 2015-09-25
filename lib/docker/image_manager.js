import assert from 'assert';
import IndexedImage from './indexed_image';
import DockerImage from './docker_image';

export default class ImageManager {
  constructor(runtime) {
    assert(runtime.docker, 'Docker instance must be provided');
    this.runtime = runtime;
    this.docker = runtime.docker;
    this.log = runtime.log || process.stdout.write;
    this._lastImageEnsured = null;
  }

  async ensureImage(imageDetails, stream, scopes = []) {
    if (typeof imageDetails === 'string') {
      imageDetails = {
        name: imageDetails,
        type: 'image-id'
      };
    }

    this.runtime.log('pull image', {
     image: imageDetails
    });

    return this._lastImageEnsured = Promise.resolve(this._lastImageEnsured)
      .catch(() => {}).then(async () => {
        let imageHandler = this.getImageHandler(imageDetails, stream, scopes);
        let exists = await imageHandler.imageExists();

        if (!exists) {
          await imageHandler.download();
        }

        return imageHandler.imageId;
      });
  }

  getImageHandler(image, stream, scopes) {
    let handler;
    if (image.type === 'image-id') {
      handler = new DockerImage(this.runtime, image, stream, scopes);
    // TODO throw error when unrecognized image type
    } else {
      handler = new IndexedImage(this.runtime, image, stream, scopes);
    }

    return handler;
  }
}
