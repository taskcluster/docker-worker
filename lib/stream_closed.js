/**
Tiny helper to wait for a stream to be finished writing.
*/

var Promise = require('promise');

module.exports = function waitForStream(stream) {
  return new Promise(function(accept, reject) {
    if (stream.closed) return accept();
    stream.once('finish', accept);
    stream.once('error', reject);
  }.bind(this));
}
