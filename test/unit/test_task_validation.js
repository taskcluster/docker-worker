import assert from 'assert';
import _ from 'lodash';

import { validateTask } from '../../lib/util/validation';

suite('Task validation', function() {
  test('accept valid schema', async function () {
    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: ["echo", "5"],
        features: { bufferLog: true },
        maxRunTime: 5 * 60
      }
    }
    
    let errors = await validateTask(task);
    assert(errors === null, 'Valid payload considered invalid.');
  });
  
  test('catch invalid schema', async function () {
    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        // No command is an invalid schema.
        command: [],
        features: { bufferLog: true },
        maxRunTime: 5 * 60
      }
    }
    
    let errors = await validateTask(task);
    assert(!_.isEmpty(errors), 'Invalid payload considered valid.');
  });
});
