import request from 'superagent';
import fs from 'fs';

/*
 * Downloads an artifact for a particular task and saves it locally.
 *
 * @param {Object} queue - Queue instance
 * @param {String} taskId - ID of the task
 * @param {String} artifactPath - Path to find the artifact for a given task
 * @param {String} destination - Path to store the file locally
 */
export default async function(queue, taskId, artifactPath, destination) {
  let url = queue.buildUrl(
      queue.getLatestArtifact,
      taskId,
      artifactPath
  );

  // TODO add some retry mechanism
  try {
    let req = request.get(url);
    req.pipe(fs.createWriteStream(destination));

    await new Promise((accept, reject) => {
      req.on('end', accept);
      req.on('error', reject);
    });

    if (req.res.statusCode !== 200) {
      throw new Error(req.res.statusMessage);
    }
  } catch(e) {
    throw new Error(
      `Could not download image artifact "${artifactPath} from ` +
      `task "${taskId}". ${e.message}`
    );
  }
}

