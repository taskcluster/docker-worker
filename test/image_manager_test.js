import assert from 'assert';
import dockerUtils from 'dockerode-process/utils';
import ImageManager from '../lib/docker/image_manager';
import Docker from '../lib/docker';

let docker = Docker();

const DOCKER_CONFIG = {
  defaultRegistry: 'registry.hub.docker.com',
  maxAttempts: 5,
  delayFactor: 15 * 1000,
  randomizationFactor: 0.25
};

suite('Image Manager', () => {
  test('requires docker instance', async () => {
    try {
      let im = ImageManager();
      assert(false, 'Image manager should require docker instance');
    } catch(e) {
      return;
    }
  });

  test('download docker image', async () => {
    let image = 'gliderlabs/alpine:latest';
    await dockerUtils.removeImageIfExists(docker, image);
    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG
    };

    let im = new ImageManager(runtime);
    let imageId1 = await im.ensureImage(image, process.stdout);

    im.docker = {};

    let imageId2;
    try {
      imageId2 = await im.ensureImage(image, process.stdout);
    } catch(e) {
      assert(false, 'Image Manager should not try to download an already downloaded image');
    }

    assert.equal(imageId1, imageId2, 'Image IDs for the same image should be the same');
  });
});
