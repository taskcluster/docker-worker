import Debug from 'debug';
import fs from 'mz/fs';
import _ from 'lodash';
import path from 'path';
import Promise from 'promise';
import slugid from 'slugid';
import taskcluster from 'taskcluster-client';
import tar from 'tar-fs';
import uploadToS3 from '../upload_to_s3';
import waitForEvent from '../wait_for_event';
import zlib from 'zlib';

let debug = Debug('docker-worker:features:cache-save');

//must be changed if the delimimter in lib/volume_cache.js is changed
let KEY_DELIMITER = '::';

export default class DockerSave {
  async killed (task) {
    let errors = [];
    await Promise.all(task.volumeCaches.map(async (cacheStr) => {
      try {
        let cache = cacheStr.split(KEY_DELIMITER);
        let loc = path.join(task.runtime.cache.volumeCachePath, cache[0], cache[1] + '/');

        //temporary path for saved file
        let pathname = path.join('/tmp', slugid.v4() + '.tar.gz');
        let zipStream = tar.pack(loc, { dereference: true }).pipe(zlib.createGzip());
        zipStream.pipe(fs.createWriteStream(pathname));
        await new Promise((accept, reject) => {
          zipStream.on('end', accept);
          zipStream.on('error', (error) => reject(error));
        });
        let expiration = taskcluster.fromNow(task.runtime.cacheSave.expiration);
        let stat = await fs.stat(pathname);

        await uploadToS3(task,
          fs.createReadStream(pathname),
          'public/cache/' + cache[0] + '.tar.gz',
          new Date(Date.now() + 60 * 60 * 1000), {
            'content-type': 'application/x-tar',
            'content-length': stat.size,
            'content-encoding': 'gzip'
        });

        debug('%s uploaded', cache[0]);

        //cleanup
        fs.unlink(pathname).catch((err) => {
          task.runtime.log('[alert-operator] could not delete cache save tarball, worker may run out of hdd space\r\n'
            + err + err.stack);
        });
      } catch (err) {
        errors.push(err);
      }
    }));
    if (errors.length > 0) {
      let errorStr = 'cache could not be uploaded: ';
      errors.map((err) => {
        errorStr = errorStr + err + err.stack;
      });
      debug(errorStr);
      throw new Error(errorStr);
    }
  }
}
