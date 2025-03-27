import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  productId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['one-time', 'subscription'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  transactionDate: {
    type: Date,
    required: true
  }
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

const Transaction = mongoose.model('Transaction', TransactionSchema);

export default Transaction;