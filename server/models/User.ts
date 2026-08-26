import mongoose, { type Document, type Model } from 'mongoose'
import bcrypt from 'bcryptjs'

export interface IUser extends Document {
  name: string
  email: string
  passwordHash: string
  matchPassword(password: string): Promise<boolean>
}

interface IUserModel extends Model<IUser> {
  hashPassword(password: string): Promise<string>
}

const userSchema = new mongoose.Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
)

userSchema.methods.matchPassword = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash)
}

userSchema.statics.hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export default mongoose.model<IUser, IUserModel>('User', userSchema)
