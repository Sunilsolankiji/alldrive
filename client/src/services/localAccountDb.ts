/**
 * Local account database — stored entirely on this device using IndexedDB.
 * Nothing is sent to any server. Passwords are hashed with bcryptjs before storage.
 */
import { openDB, type IDBPDatabase } from 'idb'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'

const DB_NAME = 'alldrive_local_accounts'
const DB_VERSION = 1

export interface LocalAccount {
  id: string
  name: string
  email: string
  passwordHash: string
  createdAt: string
}

export interface LocalSession {
  token: string
  accountId: string
  expiresAt: number // unix ms
}

type LocalAccountDB = {
  accounts: {
    key: string
    value: LocalAccount
    indexes: { by_email: string }
  }
  sessions: {
    key: string
    value: LocalSession
  }
}

let _db: IDBPDatabase<LocalAccountDB> | null = null

async function getDb() {
  if (_db) return _db
  _db = await openDB<LocalAccountDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const accounts = db.createObjectStore('accounts', { keyPath: 'id' })
      accounts.createIndex('by_email', 'email', { unique: true })
      db.createObjectStore('sessions', { keyPath: 'token' })
    },
  })
  return _db
}

export async function createAccount(name: string, email: string, password: string): Promise<LocalAccount> {
  const db = await getDb()
  const existing = await db.getFromIndex('accounts', 'by_email', email.toLowerCase())
  if (existing) throw new Error('An account with this email already exists on this device.')

  const passwordHash = await bcrypt.hash(password, 10)
  const account: LocalAccount = {
    id: uuid(),
    name,
    email: email.toLowerCase(),
    passwordHash,
    createdAt: new Date().toISOString(),
  }
  await db.add('accounts', account)
  return account
}

export async function verifyAccount(email: string, password: string): Promise<LocalAccount> {
  const db = await getDb()
  const account = await db.getFromIndex('accounts', 'by_email', email.toLowerCase())
  if (!account) throw new Error('No account found for this email.')
  const ok = await bcrypt.compare(password, account.passwordHash)
  if (!ok) throw new Error('Incorrect password.')
  return account
}

export async function createSession(accountId: string): Promise<string> {
  const db = await getDb()
  const token = uuid()
  const session: LocalSession = {
    token,
    accountId,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  }
  await db.put('sessions', session)
  return token
}

export async function resolveSession(token: string): Promise<LocalAccount | null> {
  if (!token) return null
  const db = await getDb()
  const session = await db.get('sessions', token)
  if (!session || session.expiresAt < Date.now()) return null
  const acc = await db.get('accounts', session.accountId)
  return acc ?? null
}

export async function deleteSession(token: string): Promise<void> {
  const db = await getDb()
  await db.delete('sessions', token)
}
