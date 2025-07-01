import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  referral: String,
  theme: { type: String, default: 'light' },
  password: String,
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);
