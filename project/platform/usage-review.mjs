// A manual assessment releases a hold; it never pretends to be provider usage.
export const isUsageReviewed = entry => entry?.reconciliation?.kind === 'administrator_assessment'
export const usageReservation = entry => {const value=entry?.transportReservationUsd??entry?.cancellationReservationUsd;return !entry?.complete&&!isUsageReviewed(entry)&&Number.isFinite(value)&&value>0?value:0}
export const accountedUsageCost = entry => (entry.knownCost || 0) + (isUsageReviewed(entry) ? entry.reconciliation.additionalCostUsd : usageReservation(entry))
export function assessUnknownUsage(data, actor, entryId, payload, now) {
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}) }
  const keys = ['userId','total','knownCostUsd','additionalCostUsd','reason','confirm']
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== keys.length || Object.keys(payload).some(k => !keys.includes(k))) fail('فیلدهای بررسی مصرف معتبر نیست.')
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : ''
  if (payload.confirm !== true || reason.length < 10 || reason.length > 500 || /[\x00-\x08\x0b-\x1f\x7f]/.test(reason)) fail('تأیید مسئولیت و دلیل بررسی (۱۰ تا ۵۰۰ کاراکتر) لازم است.')
  const amount = payload.additionalCostUsd
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1000000 || Math.abs(amount - Math.round(amount * 1e9) / 1e9) > 1e-12) fail('هزینهٔ اضافی باید عدد دلاری نامنفی با حداکثر ۹ رقم اعشار باشد.')
  const entry = data.usageEntries?.find(e => e.id === entryId && e.userId === payload.userId)
  const user = data.users.find(u => u.id === payload.userId)
  if (!user || !entry || entry.complete || entry.reconciliation || entry.total !== payload.total || entry.knownCost !== payload.knownCostUsd) fail('رکورد مصرف تغییر کرده یا قابل بررسی نیست؛ گزارش را تازه کنید.', 409)
  const reserved=usageReservation(entry)
  entry.reconciliation = {kind:'administrator_assessment',actorId:actor.id,at:now.toISOString(),reason,additionalCostUsd:amount,originalComplete:entry.complete,originalCost:entry.cost,...(reserved?{releasedReservationUsd:reserved}:{})}
  // Keep entry.complete, entry.cost, all token counters and knownCost intact.
  const totals = new Set([user.usage?.month === entry.period ? user.usage : null, user.monthlyUsage?.[entry.period]].filter(Boolean))
  for (const row of totals) { if(!reserved)row.incomplete = Math.max(0, row.incomplete - 1); row.cost += amount-reserved;if(reserved)row.reservedCost=Math.max(0,(row.reservedCost||0)-reserved) }
  return {entry,user}
}
