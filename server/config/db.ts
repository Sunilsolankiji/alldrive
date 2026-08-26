import mongoose from 'mongoose'

mongoose.set('bufferCommands', false)

const connectDB = async (): Promise<boolean> => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI as string)
    console.log(`MongoDB connected: ${conn.connection.host}`)
    return true
  } catch (err) {
    console.error('MongoDB connection error:', (err as Error).message)
    return false
  }
}

export const isDbConnected = (): boolean => mongoose.connection.readyState === 1

export default connectDB
