import Debug from 'debug';
import fs from 'mz/fs';
import _ from 'lodash';
import path from 'path';
import Promise from 'promise';
import slugid from 'slugid';
// import tarStream from 'tar-stream';
import tar from 'tar-fs';
import uploadToS3 from '../upload_to_s3';
import waitForEvent from '../wait_for_event';
import zlib from 'zlib';

let debug = Debug('docker-worker:features:cache-save');

let KEY_DELIMITER = '::';

export default class DockerSave {
  async killed (task) {
    // var packStream = tarStream.pack();
    await Promise.all(task.volumeCaches.map(async (cacheStr) => {
      debug('uhoh');
      let cache = cacheStr.split('::');
      let loc = path.join(task.runtime.cache.volumeCachePath, cache[0], cache[1] + '/');
      debug(loc);
      debug(path.join(loc,'test.log'));
      // debug(await fs.stat(loc));
      // debug(await fs.stat(path.join(loc,'test.log')));
      // let testStream = fs.createReadStream(path.join(loc,'test.log'));
      // testStream.pipe(process.stdout);
      // await waitForEvent(testStream, 'end');

      //temporary path for saved file
      let pathname = path.join('/tmp', slugid.v4() + '.tar.gz');
      let zipStream = tar.pack(loc, { dereference: true }).pipe(zlib.createGzip());
      zipStream.pipe(fs.createWriteStream(pathname));
      await waitForEvent(zipStream, 'end');
      
      let expiration = new Date(Date.now() + task.runtime.dockerSave.expiration);
      let stat = await fs.stat(pathname);
      debug(stat.size);

      await uploadToS3(task,
        fs.createReadStream(pathname),
        'public/' + cache[0] + '.tgz',
        new Date(Date.now() + 60 * 60 * 1000), {
          'content-type': 'application/x-tar',
          'content-length': stat.size,
          'content-encoding': 'gzip'
      });

      debug('%s uploaded', cache[0]);

      //cleanup
      fs.unlink(pathname).catch(() => {
        task.runtime.log('[alert-operator] could not delete cache save tarball, worker may run out of hdd space');
      });
    })).then(() => { debug('all cache(s) uploaded'); }, (e) => {
      debug('cache could not be uploaded: ' + e + e.stack);
    });
  }
}