const {EventEmitter} = require('events');
const split2 = require('split2');

/**
 * This is an implementation of the worker-runner protocol documented at
 * https://github.com/taskcluster/taskcluster-worker-runner/blob/master/protocol.md
 */

/**
 * A transport should have a `send(message)` method to send messages,
 * and should emit a `message` event when one is received.  Since this
 * implements only the worker side of the protocol, invalid lines are
 * simply ignored.
 *
 * StreamTransport implements this interface using Node streams.
 */
class StreamTransport extends EventEmitter {
  constructor(input, output) {
    super();

    // line-buffer the input and react to individual messages
    const lines = input.pipe(split2());

    lines.on('data', line => {
      if (!line.startsWith('~{') || !line.endsWith('}')) {
        return;
      }
      let msg;
      try {
        msg = JSON.parse(line.slice(1));
      } catch (err) {
        return;
      }
      if (!msg.type) {
        return;
      }
      this.emit('message', msg);
    });

    // emit end as well when the input closes, for testing purposes
    lines.on('end', () => this.emit('end'));

    this.output = output;
  }

  send(message) {
    this.output.write('~' + JSON.stringify(message) + '\n');
  }
}

exports.StreamTransport = StreamTransport;
