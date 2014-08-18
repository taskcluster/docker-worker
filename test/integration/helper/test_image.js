/**
Abstractions over docker `busybox` image.
*/
var dockerUtils = require('dockerode-process/utils');
var waitForEvent = require('../../../lib/wait_for_event');

// Terrible hack to cache busybox image id...
var _globalBusyboxId = null;

// Tag of busybox image this will not get updated so should be okay.
var TEST_IMAGE = 'lightsofapollo/busybox:latest';

function* getTestImageId(docker) {
  // Ensure the image exists...
  var stream = dockerUtils.pullImageIfMissing(docker, TEST_IMAGE);
  stream.pipe(process.stdout);
  //stream.resume();
  yield waitForEvent(stream, 'end');

  var image = docker.getImage(TEST_IMAGE);
  var inspect = yield image.inspect();
  return inspect.Id;
}

exports.tag = function* (docker, name, tag) {
  var imageId = _globalBusyboxId;
  if (!imageId) {
    imageId = yield getTestImageId(docker);
    _globalBusyboxId = imageId;
  }

  var image = docker.getImage(imageId);
  yield image.tag({ repo: name, tag: tag });
};
