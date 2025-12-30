// Server-only helpers for talking to a ZKTeco K50 (or compatible) device via TCP.
// Uses zklib-js under the hood. This must never be imported from client components.

import type { AttendanceLog, User as ZKUser } from './types'

// zklib-js is CommonJS, so we require() to avoid bundler issues.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ZKLib = require('zklib-js')

const DEFAULT_PORT = 4370
const SOCKET_TIMEOUT = 5000
const INACTIVITY_TIMEOUT = 5000

export type DeviceConnectionConfig = {
  ip: string
  port?: number
}

function createClient({ ip, port = DEFAULT_PORT }: DeviceConnectionConfig) {
  // new ZKLib(ip, port, timeout, inActivityTime)
  const client = new ZKLib(ip, port, SOCKET_TIMEOUT, INACTIVITY_TIMEOUT)
  return client
}

async function withClient<T>(
  config: DeviceConnectionConfig,
  fn: (client: any) => Promise<T>
): Promise<T> {
  const client = createClient(config)
  let connected = false
  try {
    // zklib-js createSocket throws on error; it does not return a boolean.
    await client.createSocket()
    connected = true
    return await fn(client)
  } catch (err) {
    console.error('K50 device error:', err)
    throw err
  } finally {
    if (connected) {
      try {
        await client.disconnect()
      } catch (e) {
        console.warn('Failed to disconnect K50 device cleanly:', e)
      }
    }
  }
}

export async function fetchUsers(config: DeviceConnectionConfig): Promise<ZKUser[]> {
  return withClient(config, async (client) => {
    const res = await client.getUsers()
    // zklib-js may return { data } or array directly depending on version
    return Array.isArray(res) ? res : res?.data || []
  })
}

export async function fetchAttendance(
  config: DeviceConnectionConfig
): Promise<AttendanceLog[]> {
  return withClient(config, async (client) => {
    const res = await client.getAttendances()
    const rows: any[] = Array.isArray(res) ? res : res?.data || []

    return rows.map((r) => ({
      // For your K50, zklib-js exposes the user as deviceUserId (string)
      userId: Number(
        r?.deviceUserId ?? r?.uid ?? r?.userId ?? r?.user_id ?? 0
      ),
      // And the time as recordTime (localized string)
      timestamp: new Date(
        r?.recordTime || r?.timestamp || r?.time || r?.checkTime || Date.now()
      ),
      raw: r,
    }))
  })
}


