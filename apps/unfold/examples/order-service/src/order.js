export function moneyToCents(amount) {
  if (!Number.isFinite(amount) || amount < 0) throw new TypeError('Amount must be a finite non-negative number');
  return Math.round(amount * 100);
}

export function orderTotal(items) {
  return items.reduce((sum, item) => {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new TypeError('Quantity must be a positive integer');
    return sum + moneyToCents(item.price) * item.quantity;
  }, 0);
}
