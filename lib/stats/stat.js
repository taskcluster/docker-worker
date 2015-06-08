import base from 'taskcluster-base';
import debugLogger from 'debug';

import * as series from './series';

let debug = debugLogger('taskcluster-docker-worker:stat');

export default class Stat {
  constructor(config) {
    this.influx = new base.stats.Influx(config.influx);
    this.baseWorkerStats = {
      workerId: config.workerId,
      workerGroup: config.workerGroup,
      workerType: config.workerType,
      provisionerId: config.provisionerId
    };
    this.reporters = {};
  }

  createReporter(seriesName) {
    debug(`creating influx reporter: ${seriesName}`);
    if (!(seriesName in series)) {
      throw new Error(
        `Cannot create influx reporter for ${seriesName}.  No ` +
        `reporter defined`
      );
    }

    debug(`added influx reporter: ${seriesName}`);
    return series[seriesName].reporter(this.influx);
  }

  getReporter(seriesName) {
    if (!(seriesName in this.reporters)) {
      this.reporters[seriesName] = this.createReporter(seriesName);
    }

    return this.reporters[seriesName];
  }

  increment(seriesName, value=1) {
    let reporter = this.getReporter(seriesName);

    debug(`incrementing ${seriesName}`);
    reporter(Object.assign({}, this.baseWorkerStats, {value: value}));
  }

  time(seriesName, startTime) {
    let endTime = Date.now();
    let duration = endTime - startTime;
    let reporter = this.getReporter(seriesName);

    debug(`adding timing for ${seriesName}. Duration: ${duration}`);
    reporter(Object.assign({}, this.baseWorkerStats, {value: duration}));
  }

  /**
  Timer helper it takes a generator (or any yiedable from co) and times
  the runtime of the action and issues timing metrics to statsd.

  @param {String} seriesName statistic name.
  @param {Generator|Function|Promise} generator or yieldable.
  */
  async timeGen(seriesName, fn) {
    let reporter = this.getReporter(seriesName);
    let start = Date.now();
    let result = await fn;
    let duration = Date.now() - start;

    debug(`adding timing for ${seriesName}. Duration: ${duration}`);
    reporter(Object.assign({}, this.baseWorkerStats, {value: duration}));

    return result;
  }
}
