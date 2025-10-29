// server.js
import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

import cors from "cors";


// Enable CORS for your frontend origin
app.use(cors());

app.use(express.json());


const MONGO_URI = process.env.MONGO_URI_WORKER;

// ------------------ MongoDB Connection ------------------
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => console.log("✅ MongoDB connected"));

// ------------------ Worker Schema ------------------
const workerSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  location: { type: String, required: true },
  gender: { type: String, required: true },
  skills: { type: [String], required: true },

  // 🔹 Wallet
wallet: {
  balance: { type: Number, default: 0 },
  commissionOwed: { type: Number, default: 0 }, // tracks unpaid commissions
  currency: { type: String, default: "INR" },
  minRequired: { type: Number, default: 100 },
  lastUpdated: { type: Date, default: Date.now },
  transactions: [
    {
      type: { type: String, enum: ["credit", "debit"], required: true },
      amount: { type: Number, required: true },
      description: { type: String, default: "" },
      source: { type: String, enum: ["customer", "platform"], default: "platform" },
      date: { type: Date, default: Date.now },
    },
  ],
}

});


export const Worker = mongoose.model("Worker", workerSchema);

// ------------------ Routes ------------------


// Get Worker by ID
app.get("/workers/:id", async (req, res) => {
    try {
        const worker = await Worker.findById(req.params.id).select('name'); // Only fetch the name, as that's what's needed
        
        if (!worker) {
            return res.status(404).json({ message: "Worker not found" });
        }

        // Return the necessary data. In the booking service, only 'name' is accessed.
        res.json({
            id: worker._id,
            name: worker.name,
            // Include other fields if needed by the caller, e.g.,
            // location: worker.location, 
            // skills: worker.skills
        });

    } catch (err) {
        console.error("Fetch worker by ID error:", err.message);
        // Handle invalid ID format (e.g., CastError)
        if (err.name === 'CastError') {
             return res.status(400).json({ message: "Invalid worker ID format" });
        }
        res.status(500).json({ message: "Internal server error" });
    }
});


// Worker Registration
app.post("/workers/register", async (req, res) => {
  try {
    const { phone, password, name, location, gender, skills } = req.body;

    // check if phone already exists
    const existingWorker = await Worker.findOne({ phone });
    if (existingWorker) {
      return res.status(400).json({ error: "Worker with this phone already exists" });
    }

    const worker = new Worker({
      phone,
      password,
      name,
      location,
      gender,
      skills,
    });

    await worker.save();
    res.status(201).json({ message: "Worker registered successfully", worker });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Worker Login
import jwt from "jsonwebtoken";
const JWT_KEY = process.env.JWT_KEY;
app.post("/workers/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    const worker = await Worker.findOne({ phone });
    if (!worker) {
      return res.status(400).json({ error: "Worker not found" });
    }

    if (worker.password !== password) {
      return res.status(400).json({ error: "Invalid password" });
    }
    console.log(worker)
    console.log(JWT_KEY)
    // Generate JWT
    const token = jwt.sign({ id: worker._id },JWT_KEY, { expiresIn: "1d" });

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      worker: {
        id: worker._id,
        name: worker.name,
        phone: worker.phone,
        location: worker.location,
        gender: worker.gender,
        skills: worker.skills,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Middleware
function verifyToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token" });
  jwt.verify(token, JWT_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = decoded;
    next();
  });
}

// Get balance
app.get("/api/worker/balance", verifyToken, async (req, res) => {
  const worker = await Worker.findById(req.user.id);
  if (!worker) return res.status(404).json({ message: "Worker not found" });

  const { balance, currency, lastUpdated } = worker.wallet;
  res.json({ workerId: worker._id, balance, currency, lastUpdated });
});

// Top-up balance
app.post("/api/worker/wallet/topup", verifyToken, async (req, res) => {
  const { amount, description } = req.body;
  if (amount <= 0) return res.status(400).json({ message: "Invalid amount" });

  const worker = await Worker.findById(req.user.id);
  worker.wallet.balance += amount;
  worker.wallet.transactions.push({ type: "credit", amount, description });
  worker.wallet.lastUpdated = new Date();

  await worker.save();
  res.json({ success: true, balance: worker.wallet.balance });
});

// Transaction history
app.get("/api/worker/wallet/transactions", verifyToken, async (req, res) => {
  const worker = await Worker.findById(req.user.id);
  if (!worker) return res.status(404).json({ message: "Worker not found" });

  res.json(worker.wallet.transactions);
});


// // Worker model from the worker DB (connect or via API call)
// const Worker = mongoose.model("Worker"); 

// // Example: deduct commission when booking marked as completed
// const commissionRate = 0.2; // 20%

// // If payment was to worker directly, add commission to wallet.commissionOwed
// if (booking.payment.method === "to_worker") {
//   worker.wallet.commissionOwed += booking.payment.commission.amount;
// } else {
//   // Already paid via platform, deduct commission from balance
//   worker.wallet.balance -= booking.payment.commission.amount;
//   worker.wallet.transactions.push({
//     type: "debit",
//     amount: booking.payment.commission.amount,
//     description: `Commission for booking ${booking.bookingId}`,
//     source: "platform",
//   });
// }
// await worker.save();


// Worker Commission Settlement API
app.post("/api/internal/worker/pay-commission", async (req, res) => {
  try {
    const { workerId, amount, bookingId } = req.body;
    const worker = await Worker.findById(workerId);
    if (!worker) return res.status(404).json({ message: "Worker not found" });

    if (worker.wallet.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    worker.wallet.balance -= amount;
    worker.wallet.transactions.push({
      type: "debit",
      amount,
      description: `Commission for booking ${bookingId}`,
      source: "platform",
    });
    worker.wallet.lastUpdated = new Date();

    await worker.save();

    res.json({ success: true, balance: worker.wallet.balance });
  } catch (err) {
    console.error("Pay commission error:", err.message);
    res.status(500).json({ message: "Failed to pay commission" });
  }
});


// Internal API - update worker balance (called from Bookings backend)
app.post("/api/internal/worker/update-wallet", async (req, res) => {
  try {
    const { workerId, payout, commission, bookingId } = req.body;

    console.log("➡️ Received update-wallet request:", req.body);

    if (!workerId) {
      return res.status(400).json({ message: "workerId is required" });
    }

    const worker = await Worker.findById(workerId);

    if (!worker) {
      console.error(`❌ Worker not found for id: ${workerId}`);
      return res.status(404).json({ message: "Worker not found in DB" });
    }

    console.log("✅ Worker found:", worker._id.toString(), worker.phone);

    // Update wallet
    worker.wallet.balance = (worker.wallet.balance || 0) + payout;
    worker.wallet.transactions.push({
      type: "credit",
      amount: payout,
      description: `Payout for booking ${bookingId}`,
      source: "platform",
    });

    worker.wallet.commissionOwed =
      (worker.wallet.commissionOwed || 0) + commission;
    worker.wallet.lastUpdated = new Date();

    await worker.save();

    res.json({ success: true, balance: worker.wallet.balance });
  } catch (err) {
    console.error("Update wallet error:", err.message);
    res.status(500).json({ message: "Failed to update wallet" });
  }
});




// ------------------ Start Server ------------------
const PORT = 8000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on 0.0.0.0:${PORT}`));
