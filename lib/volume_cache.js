var path = require('path');
var mkdirp = require('mkdirp');
var fs = require('fs');
var rmrf = require('rimraf');
var Promise = require('promise');

function removeDir(directory) {
  return new Promise(function(accept, reject) {
    rmrf(directory, function (error) {
      if (error) {
        reject(error);
      } else {
        accept();
      }
    });
  });
}

/**
Cache manager for volumes that can be reused between containers. Cached volumes
will be indexed based on timestamps and reused in the order of most recently used.

@constructor
@param {Object} configuration settings for the volume cache manager
*/
function VolumeCache(config) {
  this.rootCachePath = config.rootCachePath;
  this.log = config.log;
  this.cache = {};
  this.stats = config.stats;
}

VolumeCache.prototype = {
  /**
  Add a cached volume along with an optional instancePath.  Cached volume will
  be marked as not mounted until otherwise specified.

  @param {String} Name of the cached volume.
  @param {String} Option path for the cached volume.
  @return {Object} Cached volume instance that is not mounted.
  */
  add: function(cacheName, instancePath) {
    var instanceId = Date.now().toString();
    if (!instancePath) {
      var cachePath = path.join(this.rootCachePath, cacheName);
      instancePath = path.join(cachePath, instanceId);
    }

    if (!fs.existsSync(instancePath)) {
      mkdirp.sync(instancePath);
    }

    this.cache[cacheName][instanceId] = {
      path: instancePath,
      mounted: false
    };

    // Create a cache key that can be used by consumers of the cache in the
    // forma of <cache name>::<instance id>
    var instance = {key: cacheName + '::' + instanceId, path: instancePath};
    return instance;
  },

  /**
  Remove any unmounted volumes when diskspace threshold is reached. This will
  be called at each garbage collection interval.

  @param {Boolean} Disksapce threshold reached
  */
  clear: function* (exceedsDiskspaceThreshold) {
    if (exceedsDiskspaceThreshold) {
      for (var cacheName in this.cache) {
        for (var instance in this.cache[cacheName]) {
          if (!this.cache[cacheName][instance].mounted) {
            var cacheKey = cacheName + '::' + instance;
            var instancePath = this.cache[cacheName][instance].path;
            yield removeDir(instancePath);
            delete this.cache[cacheName][instance];
            this.stats.increment('cache.volume.removed');
            this.log('cache volume removed',
              {key: cacheKey, path: instancePath});
          }
        }
      }
    }
  },

  /**
  Begin tracking the particular volume cache and create the necessary
  local directories.

  @param {String} Name of the cached volume.
  */
  createCacheVolume: function(cacheName) {
    var cachePath = path.join(this.rootCachePath, cacheName);
    this.cache[cacheName] = {};

    if(!fs.existsSync(cachePath)) {
      mkdirp.sync(cachePath);
      var cacheDetails = {cacheName: cacheName, cachPath: cachePath};
      this.stats.increment('cache.volume.created');
      this.log('cache volume created', cacheDetails);
    }
  },

  /**
  Get the instance for the particular cached volume.  If no instance that is not
  mounted exists, a new one will be created.

  @param {String} Name of the cached volume.
  @return {Object} Cached volume instance.
  */
  get: function (cacheName) {
    var instanceId;

    if (!this.cache[cacheName]) {
      this.createCacheVolume(cacheName);
    } else {
      var instanceIds = Object.keys(this.cache[cacheName]).sort().reverse();
      for (var i = 0; i < instanceIds.length; i++) {
        var id = instanceIds[i];
        if (!this.cache[cacheName][id].mounted) {
          instanceId = id;
          this.cache[cacheName][id].mounted = true;
          break;
        }
      }
    }

    var instance;
    var logMessage = '';

    if (!instanceId) {
      logMessage = 'cache volume miss';
      instance = this.add(cacheName);
      this.set(instance.key, {mounted: true});
      this.stats.increment('cache.volume.miss');
    } else {
      logMessage = 'cache volume hit';
      instance = {key: cacheName + '::' + instanceId,
        path: this.cache[cacheName][instanceId].path
      };
      this.stats.increment('cache.volume.hit');
    }
    this.log(logMessage, instance);
    return instance;
  },

  /**
  Release the claim on a cached volume.  Cached volume should only be released
  once a container has been completed removed. Local cached volume will remain
  on the filesystem to be used by the next container/task.

  @param {String} Cache key int he format of <cache name>::<instance id>
  */
  release: function(cacheKey) {
    var cacheName = cacheKey.split('::')[0];
    var instanceId = cacheKey.split('::')[1];
    var oldPath = this.cache[cacheName][instanceId].path;
    // Remove the old cached volume and add a new unmounted one with an updated
    // timestamp/id
    delete this.cache[cacheName][instanceId];
    this.add(cacheName, oldPath);
    this.log("cache volume release", {key: cacheKey, path: oldPath});
  },

  /**
  Set a property for a cached volume.

  @param {String} Cache key int he format of <cache name>::<instance id>
  @param {Object} Key name and value for the property to be set.
  */
  set: function(cacheKey, value) {
    var cacheName = cacheKey.split('::')[0];
    var instanceId = cacheKey.split('::')[1];
    for (var key in value) {
      this.cache[cacheName][instanceId][key] = value[key];
    }
  }
};

module.exports = VolumeCache;
