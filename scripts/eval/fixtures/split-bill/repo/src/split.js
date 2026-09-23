export function splitCents(totalCents, people) {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new TypeError('Total must be a non-negative whole number of cents');
  if (!Number.isInteger(people) || people < 1) throw new TypeError('People must be a positive integer');
  const share = Math.floor(totalCents / people);
  return Array.from({ length: people }, () => share);
}
