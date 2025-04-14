import mongoose from 'mongoose';
import type { SpeedrunRecord } from '../utils/leaderboard';

const leaderboardSchema = new mongoose.Schema<SpeedrunRecord>({
  id: { type: String, required: true },
  userId: { type: String, required: true },
  name: { type: String, required: true },
  date: { type: String, required: true },
  totalTime: { type: Number, required: true },
  splits: { type: [Number], required: true },
});

// Create the model if it doesn't exist, otherwise use the existing one
export const Leaderboard = mongoose.models.Leaderboard || mongoose.model<SpeedrunRecord>('Leaderboard', leaderboardSchema); 