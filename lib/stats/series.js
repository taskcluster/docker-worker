import base from 'taskcluster-base';

const BASE_WORKER_SCHEMA = {
    workerId: base.stats.types.String,
    workerType: base.stats.types.String,
    workerGroup: base.stats.types.String,
    provisionerId: base.stats.types.String
};

export const workerStart = new base.stats.Series({
  name: 'worker.start',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Time worker started
    value: base.stats.types.Number
  })
});

export const workerShutdown = new base.stats.Series({
  name: 'worker.shutdown',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Time when worker received shutdown signal
    value: base.stats.types.Number
  })
});


export const workerTotalMemory = new base.stats.Series({
  name: 'worker.memory_total',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Time when worker received shutdown signal
    value: base.stats.types.Number
  })
});

export const workerFreeMemory = new base.stats.Series({
  name: 'worker.memory_free',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Time when worker received shutdown signal
    value: base.stats.types.Number
  })
});

export const workerHDUsed = new base.stats.Series({
  name: 'worker.hd_used',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Time when worker received shutdown signal
    value: base.stats.types.Number
  })
});

export const workerHDFree = new base.stats.Series({
  name: 'worker.hd_free',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Time when worker received shutdown signal
    value: base.stats.types.Number
  })
});

export const workerHDTotal = new base.stats.Series({
  name: 'worker.hd_total',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Time when worker received shutdown signal
    value: base.stats.types.Number
  })
});

export const workerSpotTermination = new base.stats.Series({
  name: 'worker.shutdown',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    // Approximate time when terimation event emitted
    value: base.stats.types.Number
  })
});

export const volumeCacheHit = new base.stats.Series({
  name: 'volume.cache.hit',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.String
  })
});

export const volumeCacheMiss = new base.stats.Series({
  name: 'volume.cache.miss',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.String
  })
});

export const timeToFirstClaim = new base.stats.Series({
  name: 'tasks.first_claim',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});

export const claimTask = new base.stats.Series({
  name: 'tasks.claim',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});

export const abortTask = new base.stats.Series({
  name: 'tasks.abort',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});

export const reclaimTask = new base.stats.Series({
  name: 'tasks.reclaim',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});

export const cancelTask = new base.stats.Series({
  name: 'tasks.cancel',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});

export const statesLink = new base.stats.Series({
  name: 'states.linked',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});

export const statesKilled = new base.stats.Series({
  name: 'states.killed',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});

export const statesCreated = new base.stats.Series({
  name: 'states.created',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});

export const statesStopped = new base.stats.Series({
  name: 'states.stopped',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});

export const runTimeExceeded = new base.stats.Series({
  name: 'tasks.run_time_exceeded',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});

export const taskRunTime = new base.stats.Series({
  name: 'tasks.runtime',
  columns: Object.assign({}, BASE_WORKER_SCHEMA, {
    value: base.stats.types.Number
  })
});
