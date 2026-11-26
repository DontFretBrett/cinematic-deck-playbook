// One source of truth for what the deck claims.
//
// Every number shown on screen lives here. Headlines, geometry and speaker notes all read from this
// object, so they cannot disagree: change a value and the bar, the label and the sentence change
// together. checkFacts() runs at boot and stops the deck if the data cannot support what is said.

export const facts = {
  bars: 6,            // steps drawn in the bar chart
  growthPerStep: 2,   // each step is this many times the last
};
facts.total = facts.growthPerStep ** (facts.bars - 1); // 32: the "×32" label and the tallest bar

export function checkFacts() {
  if (!(Number.isInteger(facts.bars) && facts.bars >= 2)) throw new Error('facts.bars must be a whole number of at least 2');
  if (!(facts.growthPerStep > 1)) throw new Error('facts.growthPerStep must be greater than 1 for the "doubling" beat to mean anything');
  if (!Number.isFinite(facts.total)) throw new Error('facts.total is not finite');
}
