// Plain-words order status, used by every dashboard and the history page
export const orderLabel = (o) => ({
  pending: 'Waiting for the farmer to confirm',
  confirmed: o.fulfilment === 'pickup' ? 'Confirmed, ready for pickup' : 'Confirmed, on the way',
  completed: o.fulfilment === 'pickup' ? 'Collected' : 'Delivered',
  cancelled: 'Cancelled'
}[o.status]);

export const PAY = { held: 'Paid from wallet, held until delivery', released: 'Paid from wallet', collected: 'Paid on delivery', pay_on_delivery: 'Pay on delivery', refunded: 'Refunded to wallet' };

// Placed > Confirmed > Delivered progress line
export function OrderTrack({ o }) {
  if (o.status === 'cancelled') return <p className="muted small">Cancelled{o.side === 'buying' && o.payment_status === 'refunded' ? ', your money was returned to your wallet' : ''}</p>;
  const steps = ['Placed', 'Confirmed', o.fulfilment === 'pickup' ? 'Collected' : 'Delivered'];
  const at = { pending: 0, confirmed: 1, completed: 2 }[o.status];
  return <ol className="track" aria-label={orderLabel(o)}>{steps.map((s, i) => <li key={s} className={i <= at ? 'done' : ''}>{s}</li>)}</ol>;
}
