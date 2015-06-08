import diskspace from 'diskspace';
import os from 'os';

function getCPUStats() {
  let totalTimes = {};
  os.cpus().forEach((cpu) => {
    Object.keys(cpu.times).forEach((timing) => {
      if (!(timing in totalTimes)) {
        totalTimes[timing] = 0;
      }
      totalTimes[timing] += cpu.times[timing];
    });
  });

  return totalTimes;
}

export default function (config) {
  let stats = config.stats;
  let dockerVolume = config.dockerVolume;

  stats.record('workerFreeMemory', os.freemem());
  stats.record('workerTotalMemory', os.totalmem());
  stats.record('workerUptime', os.uptime());

  let cpuStats = getCPUStats();
  let totalCPUTime = 0;
  let loadTime = 0;

  Object.keys(cpuStats).forEach((timing) => {
    totalCPUTime += cpuStats[timing];
    if (timing !== 'idle') {
      loadTime += cpuStats[timing];
    }
  });

  stats.record('workerCPULoad', (loadTime/totalCPUTime) * 100);

  diskspace.check(dockerVolume, function (err, total, free) {
    stats.record('workerHDUsed', total-free);
    stats.record('workerHDFree', free);
    stats.record('workerHDTotal', total);
  });
}
