import assert from 'assert';
import dockerUtils from 'dockerode-process/utils';
import ImageManager from '../lib/docker/image_manager';
import Docker from '../lib/docker';
import { Index } from 'taskcluster-client';
import { createHash } from 'crypto';
import slugid from 'slugid';
import createLogger from '../lib/log';

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

  test('download docker image from registry', async () => {
    let image = 'gliderlabs/alpine:latest';
    await dockerUtils.removeImageIfExists(docker, image);
    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      log: createLogger()
    };

    let im = new ImageManager(runtime);
    let imageId1 = await im.ensureImage(image, process.stdout);
    let imageId2 = await im.ensureImage(image, process.stdout);

    assert.equal(imageId1, imageId2, 'Image IDs for the same image should be the same');
  });

  test('download indexed public image', async () => {
    let image = {
      namespace: 'public.garndt.garbage.test-image.v1',
      path: 'public/image.tar'
    };

    let index = new Index();
    let {taskId} = await index.findTask(image.namespace);
    let hashedName = createHash('md5')
                      .update(`${taskId}${image.path}`)
                      .digest('hex');

    await dockerUtils.removeImageIfExists(docker, hashedName);

    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      dockerVolume: '/tmp',
      log: createLogger()
    };

    let im = new ImageManager(runtime);
    let imageId = await im.ensureImage(image, process.stdout, []);

    assert.ok(imageId, 'No image id was returned');
  });

  test('temporary files removed after loading indexed public image', async () => {
    let image = {
      namespace: 'public.garndt.garbage.test-image.v1',
      path: 'public/image.tar'
    };

    let index = new Index();
    let {taskId} = await index.findTask(image.namespace);
    let hashedName = createHash('md5')
                      .update(`${taskId}${image.path}`)
                      .digest('hex');

    await dockerUtils.removeImageIfExists(docker, hashedName);

    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      dockerVolume: '/tmp',
      log: createLogger()
    };

    let im = new ImageManager(runtime);
    let imageId = await im.ensureImage(image, process.stdout, []);

    assert.ok(imageId, 'No image id was returned');
  });

  test('task not present for indexed image', async () => {
    let image = {
      namespace: slugid.nice(),
      path: 'public/image.tar'
    };

    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      dockerVolume: '/tmp',
      log: createLogger()
    };

    let im = new ImageManager(runtime);
    try {
      let imageId = await im.ensureImage(image, process.stdout, []);
      assert.ok(false, 'Exception should have been thrown');
    } catch(e) {
      assert.ok(
        e.message.includes('Could not find a task associated'),
        'Error message did not appear indicating a task could not be found'
      );
    }
  });

  test('artifact not present for indexed image', async () => {
    let image = {
      namespace: 'public.garndt.garbage.test-image.v1',
      path: 'public/image1.tar'
    };

    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      dockerVolume: '/tmp',
      log: createLogger()
    };

    let im = new ImageManager(runtime);
    try {
      let imageId = await im.ensureImage(image, process.stdout, []);
      assert.ok(false, 'Exception should have been thrown');
    } catch(e) {
      assert.ok(
        e.message.includes('Could not download image artifact'),
        'Error message did not appear indicating an artifact could not be found'
      );
    }
  });
});

