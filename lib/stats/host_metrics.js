import diskspace from 'diskspace';
import os from 'os';

export default function (config) {
  let stats = config.stats;
  let dockerVolume = config.dockerVolume;
  stats.record('workerFreeMemory', os.freemem());
  stats.record('workerTotalMemory', os.totalmem());
  diskspace.check(dockerVolume, function (err, total, free) {
    stats.record('workerHDUsed', total-free);
    stats.record('workerHDFree', free);
    stats.record('workerHDTotal', total);
  });
}
