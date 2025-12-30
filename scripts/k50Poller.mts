import 'dotenv/config'
import cron from 'node-cron'

async function runSync() {
  console.log('[k50Poller] Running scheduled sync at', new Date().toISOString())
  try {
    const mod: any = await import('../lib/k50Sync')
    const fn = mod.syncK50 ?? mod.default?.syncK50

    if (typeof fn !== 'function') {
      console.error(
        '[k50Poller] syncK50 function not found on module exports of ../lib/k50Sync'
      )
      return
    }

    const result = await fn()
    console.log('[k50Poller] Sync result:', JSON.stringify(result))
  } catch (err) {
    console.error('[k50Poller] Error during sync:', err)
  }
}

console.log('[k50Poller] Starting K50 CSV poller (every minute)...')

cron.schedule('*/1 * * * *', runSync)

// Keep process alive
process.stdin.resume()

