const assert = require('assert');
const {Readable, PassThrough} = require('stream');
const {StreamTransport} = require('../src/lib/worker-runner-protocol');

const endEvent = emitter => new Promise(resolve => emitter.on('end', resolve));

suite('worker-runner-protocol', function() {
  suite('transport', function() {
    test('receive', async function() {
      const messages = [];
      const input = new Readable();
      const output = new PassThrough();
      const sp = new StreamTransport(input, output);
      sp.on('message', msg => messages.push(msg));
      const end = endEvent(sp);

      // streams do all manner of buffering internally, so we can't test that
      // here.  However, empirically when the input is stdin, that buffering
      // is disabled and we get new lines immediately.
      input.push('ignored line\n');
      input.push('~{"type": "test"}\n');
      input.push('~{"xxx": "yyy"}\n'); // also ignored: no type
      input.push('~{"xxx", "yyy"}\n'); // also ignored: invalid JSON
      input.push(null);

      input.destroy();
      output.destroy();

      await end;

      assert.deepEqual(messages, [{type: 'test'}]);
    });

    test('send', async function() {
      const written = [];
      const input = new Readable();
      const output = new PassThrough();
      const sp = new StreamTransport(input, output);
      output.on('data', chunk => written.push(chunk));

      sp.send({type: 'test'});
      sp.send({type: 'test-again'});

      input.destroy();
      output.destroy();

      assert.deepEqual(written.join(''), '~{"type":"test"}\n~{"type":"test-again"}\n');
    });

    test('bidirectional', async function() {
      const leftward = new PassThrough();
      const rightward = new PassThrough();
      const left = new StreamTransport(leftward, rightward);
      const right = new StreamTransport(rightward, leftward);

      const leftMessages = [];
      left.on('message', msg => leftMessages.push(msg));

      const rightMessages = [];
      right.on('message', msg => rightMessages.push(msg));

      left.send({type: 'from-left'});
      right.send({type: 'from-right'});

      leftward.destroy();
      rightward.destroy();

      assert.deepEqual(leftMessages, [{type: 'from-right'}]);
      assert.deepEqual(rightMessages, [{type: 'from-left'}]);
    });
  });
});
