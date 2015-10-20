import request from 'superagent';
import fs from 'mz/fs';
import sleep from '../util/sleep';
import { fmtLog, fmtErrorLog } from '../log';
import https from 'https';

const RETRY_CONFIG = {
  maxAttempts: 5,
  delayFactor: 15 * 1000,
  randomizationFactor: 0.25
};

/*
 * Downloads an artifact for a particular task and saves it locally.
 *
 * @param {Object} queue - Queue instance
 * @param {String} taskId - ID of the task
 * @param {String} artifactPath - Path to find the artifact for a given task
 * @param {String} destination - Path to store the file locally
 */
export default async function(queue, stream, taskId, artifactPath, destination, retryConfig=RETRY_CONFIG) {
  let {maxAttempts, delayFactor, randomizationFactor} = retryConfig;
  let url = queue.buildSignedUrl(
      queue.getLatestArtifact,
      taskId,
      artifactPath
  );

  let attempts = 0;

  while (attempts++ < maxAttempts) {
    let destinationStream = fs.createWriteStream(destination);
    try {
      console.log(url);
      let res = https.get(url);
      res.pipe(destinationStream);

      await new Promise((accept, reject) => {
        res.on('end', accept);
        res.on('error', reject);
      });

      if (res.statusCode !== 200) {
        let error = new Error(res.statusMessage);
        error.statusCode = res.statusCode;
        throw error;
      }
    } catch(e) {
      if (attempts >= maxAttempts || [404, 401].includes(e.statusCode)) {
        throw new Error(
          `Could not download artifact "${artifactPath} from ` +
          `task "${taskId}" after ${attempts} attempt(s). Error: ${e.message}`
        );
      }

      // remove any partially downloaded file
      await fs.unlink(destination);

      let delay = Math.pow(2, attempts - 1) * delayFactor;
      let exponentialDelay = delay * (Math.random() * 2 * randomizationFactor + 1 - randomizationFactor);

      stream.write(fmtErrorLog(
        `Error downloading "${artifactPath}" from task ID "${taskId}". ` +
        `Next Attempt in: ${exponentialDelay.toFixed(2)} ms.`
      ));

      await sleep(exponentialDelay);
    }
  }
}

