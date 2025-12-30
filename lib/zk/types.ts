export type ZKRawAttendance = {
  uid?: number | string
  userId?: number | string
  user_id?: number | string
  timestamp?: string
  time?: string
  checkTime?: string
  [key: string]: any
}

export type AttendanceLog = {
  userId: number
  timestamp: Date
  raw: ZKRawAttendance
}

export type User = {
  uid: number
  name?: string
  password?: string
  role?: number
  cardNo?: number
  [key: string]: any
}


