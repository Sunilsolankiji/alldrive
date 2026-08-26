import mongoose, { type Document } from 'mongoose'

export interface IDriveAccount extends Document {
  userId: mongoose.Types.ObjectId
  accountEmail: string
  accountName: string
  profilePicture: string
  accessToken: string
  refreshToken: string
  tokenExpiry: Date
}

const driveAccountSchema = new mongoose.Schema<IDriveAccount>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountEmail: { type: String, required: true },
    accountName: { type: String, default: '' },
    profilePicture: { type: String, default: '' },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    tokenExpiry: { type: Date, required: true },
  },
  { timestamps: true }
)

driveAccountSchema.index({ userId: 1, accountEmail: 1 }, { unique: true })

export default mongoose.model<IDriveAccount>('DriveAccount', driveAccountSchema)
