import mongoose from "mongoose";

let connectionPromise;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured");
  if (mongoose.connection.readyState === 0) connectionPromise = undefined;

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(process.env.MONGO_URI, { maxPoolSize: 10 })
      .then(({ connection }) => {
        console.log("✅ MongoDB Connected");
        return connection;
      })
      .catch((error) => {
        connectionPromise = undefined;
        throw error;
      });
  }

  return connectionPromise;
};

export default connectDB;
