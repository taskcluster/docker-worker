import assert from 'assert';
import base from 'taskcluster-base';
import debugLogger from 'debug';

import * as series from './series';

let debug = debugLogger('taskcluster-docker-worker:stat');

export default class Stat {
  constructor(config) {
    assert(config.influx, 'Must supply an influx configuration');
    assert(config.workerId, 'Worker ID is required');
    assert(config.workerType, 'Worker type is required');
    assert(config.workerGroup, 'Worker group is required');
    assert(config.provisionerId, 'Provisioner ID is required');

    this.influx = new base.stats.Influx(config.influx);
    this.baseWorkerStats = {
      workerId: config.workerId,
      workerGroup: config.workerGroup,
      workerType: config.workerType,
      provisionerId: config.provisionerId
    };
    this.reporters = {};
  }

  /**
   * Create a reporter for the series.
   *
   * @param {String} seriesName - name of the series
   *
   * @returns {Series} series object with influx reporter
   */
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

  /**
   * Return a reporter for a given series.
   *
   * @param {String} seriesName - name of the series
   *
   * @returns {Series} series reporter
   */
  getReporter(seriesName) {
    if (!(seriesName in this.reporters)) {
      this.reporters[seriesName] = this.createReporter(seriesName);
    }

    return this.reporters[seriesName];
  }

  /**
   * Add a new entry for a series.  By default value capture will be '1' unless
   * otherwise specified.  When capturing a timestamp (such as when a worker starts),
   * provide that value.  This way either the count can be returned or some time
   * calculation from influx.
   *
   * @param {String} seriesName - name of the series
   */
  increment(seriesName, value=1) {
    let reporter = this.getReporter(seriesName);

    debug(`incrementing ${seriesName}`);
    reporter(Object.assign({}, this.baseWorkerStats, {value: value}));
  }

  /**
   * Add a new entry with a duration based on the startTime provided and
   * current time.
   *
   * @param {String} seriesName - name of the series
   * @param {Number} startTime - Time that the event started
   */
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
