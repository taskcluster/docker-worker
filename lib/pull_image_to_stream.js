import { DockerImage, IndexedImage } from './docker_image';
import Debug from 'debug';

let debug = Debug('pull_image');

function getImageHandler(image) {
  // Treat as an indexed image if object
  if (typeof image === 'object'){
    return IndexedImage;
  } else {
    return DockerImage;
  }
}

export default async function pullDockerImage(runtime, image, scopes, taskId, runId, stream) {
  let Handler = getImageHandler(image);
  let imageHandler = new Handler(runtime, image, stream, scopes);

  runtime.log('pull image', {
    taskId: taskId,
    runId: runId,
    image: imageHandler.fullName
  });

  await imageHandler.download();

  return imageHandler.fullName;
}
