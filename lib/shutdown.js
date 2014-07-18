/**

The logic here determines when to trigger a shutdown of the worker itself.
We use a range to figure out if we are in a good spot to trigger a shutdown the
ideal case being we don't shutdown too early and we don't trigger a shutdown at 
the very end of a billing cycle (might as well wait for another cycle).

See the tests for examples on how this logic works.

@param {Number} minutesRemainder
  Total number of remaining minutes in the biling cycle.

@param {Number} minutesRemainStart
  Number (inclusive) of minutes left in the cycle where we can trigger a shutdown.

@param {Number} minutesRemainStop
  Number (inclusive) of minutes left where we should _not_ trigger a shutdown.

*/
function shutdown(minutesRemainder, minutesRemainStart, minutesRemainStop) {
  if (minutesRemainStart < minutesRemainStop) {
    throw new Error('start must be greater then stop.');
  }

  return minutesRemainder <= minutesRemainStart &&
         minutesRemainder >= minutesRemainStop;
}

module.exports = shutdown;
