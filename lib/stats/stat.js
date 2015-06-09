import assert from 'assert';
import base from 'taskcluster-base';

import * as series from './series';

export default class Stat {
  constructor(config) {
    assert(config.influx, 'Must supply an influx configuration');
    assert(config.workerId, 'Worker ID is required');
    assert(config.workerType, 'Worker type is required');
    assert(config.workerGroup, 'Worker group is required');
    assert(config.workerNodeType, 'Worker instance type is required');
    assert(config.provisionerId, 'Provisioner ID is required');

    this.influx = new base.stats.Influx(config.influx);
    this.baseWorkerStats = {
      workerId: config.workerId,
      workerGroup: config.workerGroup,
      workerType: config.workerType,
      instanceType: config.workerNodeType,
      provisionerId: config.provisionerId,
      capacity: config.capacity

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
   * Records a time series entry that will be reported to influx.
   *
   * @param {String} seriesName - name of the series
   * @param {Object|Number|String} value - Value to supply for the series.
   */
  record(seriesName, value=1) {
    let reporter = this.getReporter(seriesName);
    let stat = value;
    if (typeof value !== 'object') {
      stat = {'value': value};
    }

    reporter(Object.assign({}, this.baseWorkerStats, stat));
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
    this.record(seriesName, duration);
  }

  /**
  Timer helper it takes a generator (or any yiedable from co) and times
  the runtime of the action and issues timing metrics to influx.

  @param {String} seriesName statistic name.
  @param {Generator|Function|Promise} generator or yieldable.
  */
  async timeGen(seriesName, fn) {
    let start = Date.now();
    let result = await fn;
    let duration = Date.now() - start;

    this.record(seriesName, duration);

    return result;
  }
}
