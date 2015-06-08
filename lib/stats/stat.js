import assert from 'assert';
import base from 'taskcluster-base';

import * as series from './series';

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
    if (!(seriesName in series)) {
      throw new Error(
        `Cannot create influx reporter for ${seriesName}.  No ` +
        `reporter defined`
      );
    }

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
   * @param {Number} value - Optional value to supply for the series. Default=1
   */
  increment(seriesName, value=1) {
    let reporter = this.getReporter(seriesName);

    reporter(Object.assign({}, this.baseWorkerStats, {value: value}));
  }

  /**
   * Wrapper around Stats.increment() that does the same thing (records an entry
   * with a given value) but makes the intention clearer.
   *
   * @param {String} seriesName - name of the series
   * @param {Number} value - Value to supply for the series.
   */
  record(seriesName, value) {
    this.increment(seriesName, value);
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

    reporter(Object.assign({}, this.baseWorkerStats, {value: duration}));

    return result;
  }
}
