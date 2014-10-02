var path = require('path');
var mkdirp = require('mkdirp');
var fs = require('fs');


function VolumeCache(config) {
  this.rootCachePath = config.rootCachePath;
  this.log = config.log;
  this.cache = {};
}

VolumeCache.prototype = {
  createCacheVolume: function(cacheName) {
    var cachePath = path.join(this.rootCachePath, cacheName);
    this.cache[cacheName] = {};

    if(!fs.existsSync(cachePath)) {
      mkdirp.sync(cachePath);
      var cacheDetails = {cacheName: cacheName, cachPath: cachePath};
      this.log('created cached volume', cacheDetails);
    }
  },

  add: function(cacheName, instancePath) {
    var instanceId = Date.now().toString();
    if (!instancePath) {
      var cachePath = path.join(this.rootCachePath, cacheName);
      instancePath = path.join(cachePath, instanceId);
    }
    // TODO if the cache can't be created? error task?
    if (!fs.existsSync(instancePath)) {
      mkdirp.sync(instancePath);
    }
    this.cache[cacheName][instanceId] = {
      path: instancePath,
      mounted: false
    };

    var instance = {key: cacheName + '::' + instanceId, path: instancePath};
    return instance;
  },

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
    var log_message = ''

    if (!instanceId) {
      log_message = 'cache miss';
      instance = this.add(cacheName);
      this.set(instance.key, {mounted: true});
    } else {
      log_message = 'cache hit';
      instance = {key: cacheName + '::' + instanceId,
        path: this.cache[cacheName][instanceId].path
      };
    }
    this.log(log_message, instance);
    return instance;
  },

  release: function(cacheKey) {
    var cacheName = cacheKey.split('::')[0];
    var instanceId = cacheKey.split('::')[1];
    var oldPath = this.cache[cacheName][instanceId].path;
    delete this.cache[cacheName][instanceId];
    this.add(cacheName, oldPath);
    this.log("released cached volume", {key: cacheKey, path: oldPath});
  },

  set: function(cacheKey, value) {
    var cacheName = cacheKey.split('::')[0];
    var instanceId = cacheKey.split('::')[1];
    for (var key in value) {
      this.cache[cacheName][instanceId][key] = value[key];
    }
  }
};

module.exports = VolumeCache;
