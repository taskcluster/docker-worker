/**

The logic here determines when to trigger a shutdown of the worker itself.
We use a range to figure out if we are in a good spot to trigger a shutdown the
ideal case being we don't shutdown too early and we don't trigger a shutdown at 
the very end of a billing cycle (might as well wait for another cycle).

See the tests for examples on how this logic works.

@param {Number} secondsRemainder
  Total number of remaining seconds in the biling cycle.

@param {Number} secondsRemainStart
  Number (inclusive) of seconds left in the cycle where we can trigger a shutdown.

@param {Number} secondsRemainStop
  Number (inclusive) of seconds left where we should _not_ trigger a shutdown.

*/
function shutdown(secondsRemainder, secondsRemainStart, secondsRemainStop) {
  if (secondsRemainStart < secondsRemainStop) {
    throw new Error('start must be greater then stop.');
  }

  return secondsRemainder <= secondsRemainStart &&
         secondsRemainder >= secondsRemainStop;
}

module.exports = shutdown;
