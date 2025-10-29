// server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import jwt from "jsonwebtoken";

import axios from "axios";
import { UNIT_PRICES } from "./priceConfig.js";




const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

const JWT_KEY = process.env.JWT_KEY;
const MONGO_URI = process.env.MONGO_URI_BOOKINGS;
const PORT = process.env.PORTBOOKINGS;
const PORTWORKER = process.env.PORTWORKER;

// ------------------------
// MongoDB Connection
// ------------------------
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

// ------------------------
// Booking Schema
// ------------------------
const BookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true, unique: true },
    IdCustomer: { type: String, required: true, index: true },
    IdWorker: { type: String, default: "" },
    WorkerName: { type: String, default: "" },  // 🔹 Add this

    TempPhoneCustomer: { type: String, default: "unknown" },
    TempPhoneWorker: { type: String, default: "unknown" },

    address: { type: String, default: "" },
    WorkName: { type: String, required: true },

    services: [ /* … same as before … */ ],

    MonthlyOrOneTime: { type: String, default: "Monthly" },
    WhichPlan: { type: String, default: "Standard" },
    Date: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ["open", "accepted", "rejected", "completed","cancelled"],
      default: "open",
    },

    acceptedBy: { type: String, default: "" },
    rejectedBy: [{ type: String }],
    EstimatedPrice: { type: Number, required: true },

payment: {
  status: {
    type: String,
    enum: ["pending", "paid", "failed"],
    default: "pending",
  },
  mode: {
    type: String,
    enum: ["online", "cash"],
    default: "cash",
  },
  paidBy: {
    type: String,
    enum: ["customer_to_us", "customer_to_worker"],
    default: "customer_to_us",
  },
  cancelledAt: { type: Date },
  transactionId: { type: String, default: "" },
  paidAt: { type: Date },

  // 🔹 Commission sub-document
  commission: {
    amount: { type: Number, default: 0 },
    isSettled: { type: Boolean, default: false },
    settledAt: { type: Date },
  },
},

  },
  { timestamps: true }
);
BookingSchema.pre("save", function (next) {
  if (!this.payment) this.payment = {};
  if (!this.payment.commission) {
    this.payment.commission = { amount: 0, isSettled: false };
  }
  next();
});




BookingSchema.index({ status: 1, createdAt: -1 });
const Booking = mongoose.model("Booking", BookingSchema);


// ------------------------
// Pricing logic
// ------------------------

// server.js

// ... (previous code before calculatePrice)
function calculatePrice(booking) {
//   const UNIT_PRICES = {
//     Monthly: { room: 8, kitchen: 10, hall: 12, toilet: 15, meal: 25, naashta: 15, bartan: 1 },
//     OneTime: { room: 10, kitchen: 13, hall: 15, toilet: 18, meal: 40, naashta: 20, bartan: 2 },
//   };

  const isMonthly = booking.MonthlyOrOneTime === "Monthly";
  const unit = UNIT_PRICES[booking.MonthlyOrOneTime] || UNIT_PRICES.Monthly;
  const days = isMonthly ? 30 * (booking.Months || 1) : 1;

  let total = 0;

  for (const srv of booking.services || []) {
    switch (srv.WorkName) {
      case "Jhadu Pocha": {
        let jhaduFrequency = srv.JhaduFrequency;
        
        // FIX 1: Only apply plan logic if Monthly
        let jhaduFactor = 1;

        if (isMonthly) {
            if (!jhaduFrequency) {
                jhaduFrequency = 
                    booking.WhichPlan === "Premium" ? "Daily" :
                    booking.WhichPlan === "Standard" ? "Alternate day" :
                    "Alternate day";
            }
            jhaduFactor = jhaduFrequency === "Alternate day" ? 0.5 : 1;
        }

        total += ((srv.NoOfRooms || 0) * unit.room +
                  (srv.NoOfKitchen || 0) * unit.kitchen +
                  (srv.HallSize || 0) * unit.hall) * jhaduFactor * days;
        break;
      }

      case "Toilet Cleaning": {
        let toiletFreq = srv.FrequencyPerWeek;
        
        // FIX 2: Only apply plan logic if Monthly
        let toiletFactor = 1; // Default to 1 for OneTime, or 0 if Monthly logic applies

        if (isMonthly) {
            if (!toiletFreq) {
                toiletFreq = booking.WhichPlan === "Custom" ? booking.FrequencyPerWeek || "Twice a week" : "Twice a week";
            }
            toiletFactor = 0; // Reset factor before calculating for monthly
            if (toiletFreq === "Twice a week") toiletFactor = 2 / 7;
            else if (toiletFreq === "Thrice a week") toiletFactor = 3 / 7;
        }

        total += (srv.NoOfToilets || 0) * unit.toilet * toiletFactor * days;
        break;
      }

      case "Bartan Service": {
        let bartanFreq = srv.FrequencyPerDay;

        // FIX 3: Only apply plan logic if Monthly
        let bartanFactor = 1;

        if (isMonthly) {
            if (!bartanFreq) {
                bartanFreq =
                    booking.WhichPlan === "Premium" ? "Twice a day" :
                    booking.WhichPlan === "Standard" ? "Once a day" :
                    booking.FrequencyPerDay || "Once a day";
            }
            bartanFactor = bartanFreq === "Twice a day" ? 2 : 1;
        }

        total += (srv.AmountOfBartan || 0) * unit.bartan * bartanFactor * days;
        break;
      }

      case "Cook Service": {
        // Cook service inherently does not use the Standard/Premium/Custom plans for frequency derivation, 
        // but since `days` is 1 for OneTime, no changes are strictly necessary here, but we will protect it.
        const mealsPerDay = isMonthly && srv.FrequencyPerDay === "Twice" ? 2 : 1;

        // Base cooking and naashta cost (no change needed as `days` handles the scaling)
        total += (srv.NoOfPeople || 0) * mealsPerDay * unit.meal * days;
        if (srv.IncludeNaashta) total += (srv.NoOfPeople || 0) * unit.naashta * days;
        
        // Bartan ADD-ON protection
        if (srv.IncludeBartan) {
          const cookBartanFactor = isMonthly && srv.FrequencyPerDay === "Twice" ? 2 : 1;
          total += (srv.AmountOfBartan || 0) * unit.bartan * cookBartanFactor * days;
        }
        break;
      }

      default:
        break;
    }
  }

  return Math.round(total);
}

// ... (rest of server.js)



// ------------------------
// JWT Middleware
// ------------------------
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token" });

  jwt.verify(token, JWT_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = decoded;
    next();
  });
}

// ------------------------
// Routes
// ------------------------

// Dev token (testing)
app.post("/api/dev/token", (req, res) => {
  const id = req.body?.id || "demoWorker123";
  const role = req.body?.role || "worker"; // default to worker
  const token = jwt.sign({ id, role }, JWT_KEY, { expiresIn: "7d" });
  res.json({ token });
});

// Customer bookings
app.get("/api/user/bookings", verifyToken, async (req, res) => {
  try {
    const bookings = await Booking.find({ IdCustomer: req.user.id }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// ------------------------------------------
// Cancel Booking (User) - DELETE
// ------------------------------------------
// app.delete("/api/user/bookings/:id", verifyToken, async (req, res) => {
//   try {
//     const booking = await Booking.findById(req.params.id);

//     if (!booking)
//       return res.status(404).json({ message: "Booking not found" });

//     // Allow cancellation only if user owns it
//     if (booking.IdCustomer !== req.user.id)
//       return res.status(403).json({ message: "Unauthorized to cancel this booking" });

//     // Restrict cancellation after payment or acceptance
//     if (booking.payment?.status === "paid")
//       return res.status(400).json({ message: "Cannot cancel a paid booking" });
//     if (booking.status === "accepted")
//       return res.status(400).json({ message: "Cannot cancel after worker has accepted" });

//     await Booking.findByIdAndDelete(req.params.id);

//     res.json({ success: true, message: "Booking cancelled successfully" });
//   } catch (err) {
//     console.error("Cancel booking error:", err.message);
//     res.status(500).json({ message: "Server error while cancelling booking" });
//   }
// });
// PATCH /api/user/bookings/:id/cancel
app.patch("/api/user/bookings/:id/cancel",verifyToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Ensure only the customer who created it can cancel
    if (booking.IdCustomer.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (booking.status === "cancelled") {
      return res.status(400).json({ message: "Booking already cancelled" });
    }

    booking.status = "cancelled";
    booking.cancelledAt = new Date();
    await booking.save();

    // Optional: Notify worker via socket/email/push later
    res.json({ message: "Booking cancelled successfully", booking });
  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({ message: "Server error while cancelling booking" });
  }
});

// Admin → all bookings
app.get("/api/admin/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Worker → only open bookings (exclude ones they already rejected)
app.get("/api/worker/bookings/open", verifyToken, async (req, res) => {
  try {
    const bookings = await Booking.find({
      status: "open",
      rejectedBy: { $ne: req.user.id },
    }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Worker accept booking
// Worker accepts a booking — fetch worker info from Worker service via axios
app.post("/api/worker/bookings/:id/accept", verifyToken, async (req, res) => {
  try {
    // call Worker service to get worker details (name)
    // worker service runs on port 8000 in your setup
    const workerServiceUrl = `http://localhost:${PORTWORKER}/workers/${req.user.id}`;
    console.log(PORTWORKER)
    let workerResp;
    try {
      workerResp = await axios.get(workerServiceUrl);
    } catch (err) {
      // If worker service returns 404 or is down, surface a clear error
      console.error("Worker service error:", err?.response?.data || err.message);
      return res.status(500).json({ message: "Failed to fetch worker info" });
    }

    const worker = workerResp.data;
    if (!worker) {
      return res.status(404).json({ message: "Worker not found in worker service" });
    }

    // Update booking with worker ID + name. Only accept if booking is still open.
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, status: "open" },
      {
        status: "accepted",
        IdWorker: req.user.id,
        acceptedBy: req.user.id,
        WorkerName: worker.name || "",
      },
      { new: true }
    );

    if (!booking) return res.status(400).json({ message: "Booking not available" });

    // Ensure payment + commission shape exists before sending response
    if (!booking.payment) booking.payment = {};
    if (!booking.payment.commission) booking.payment.commission = { amount: 0, isSettled: false };

    res.json({
      success: true,
      booking: {
        ...booking.toObject(),
        payment: { ...booking.payment, method: booking.payment.mode }, // frontend compat
      },
    });
  } catch (err) {
    console.error("Accept booking error:", err.message);
    res.status(500).json({ message: err.message });
  }
});
// Worker → all bookings for this worker
app.get("/api/worker/bookings/all", verifyToken, async (req, res) => {
  try {
    const bookings = await Booking.find({
      IdWorker: req.user.id,
      status: { $in: ["accepted", "cancelled"] } // or include "open" if needed
    }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// Worker → accepted bookings (only for this worker)
app.get("/api/worker/bookings/accepted", verifyToken, async (req, res) => {
  try {
    const bookings = await Booking.find({
      status: "accepted",
      IdWorker: req.user.id,
    }).sort({ createdAt: -1 });

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Worker reject booking
// app.post("/api/worker/bookings/:id/reject", verifyToken, async (req, res) => {
//   try {
//     const booking = await Booking.findOneAndUpdate(
//       { _id: req.params.id, status: "open" },
//       { $addToSet: { rejectedBy: req.user.id } }, // worker added to rejected list
//       { new: true }
//     );
//     if (!booking) return res.status(400).json({ message: "Booking not available" });
//     res.json(booking);
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// User creates booking 
app.post("/api/user/book", verifyToken, async (req, res) => {
  try {
    const data = Array.isArray(req.body) ? req.body : [req.body];

const bookings = await Booking.insertMany(
  data.map((item) => {
    const EstimatedPrice = calculatePrice(item); // ✅ calculate on backend
    return {
      ...item,
      bookingId: `bk_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      IdCustomer: req.user.id,
      EstimatedPrice,
    };
  })
);


    res.status(201).json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});




app.post("/api/user/bookings/:id/pay", verifyToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // ensure payment object exists
    if (!booking.payment) booking.payment = {};
    if (!booking.payment.commission) booking.payment.commission = { amount: 0, isSettled: false };

    // prevent double payment
    if (booking.payment.status === "paid") {
      return res.status(400).json({ message: "Booking already paid" });
    }

    const { method } = req.body; // "to_platform" or "to_worker"
    booking.payment.status = "paid";
    booking.payment.mode = method === "to_platform" ? "online" : "cash";
    booking.payment.paidBy = method === "to_platform" ? "customer_to_us" : "customer_to_worker";
    booking.payment.paidAt = new Date();

    await booking.save();

    // If payment goes through platform and worker exists, update worker wallet
    if (method === "to_platform" && booking.IdWorker) {
      try {
        const payout = Math.round(booking.EstimatedPrice * 0.8);
        const commission = Math.round(booking.EstimatedPrice * 0.2);

        await axios.post("http://localhost:8000/api/internal/worker/update-wallet", {
          workerId: booking.IdWorker,
          payout,
          commission,
          bookingId: booking.bookingId,
        });

        return res.json({
          success: true,
          message: `Payment recorded, ₹${payout} credited to worker, commission ₹${commission} kept by platform`,
          booking: { ...booking.toObject(), payment: { ...booking.payment, method: booking.payment.mode } },
        });
      } catch (err) {
        console.error("❌ Worker service update failed:", err.message);
        return res.status(500).json({
          message: "Booking saved but failed to update worker balance",
          booking: { ...booking.toObject(), payment: { ...booking.payment, method: booking.payment.mode } },
        });
      }
    }

    // if method === "to_worker" (cash to worker)
    res.json({
      success: true,
      message: "Payment recorded successfully",
      booking: { ...booking.toObject(), payment: { ...booking.payment, method: booking.payment.mode } },
    });
  } catch (err) {
    console.error("Pay route error:", err.message);
    res.status(500).json({ message: err.message });
  }
});




// BookingsBackend.js
app.post("/api/worker/bookings/:id/pay-commission", verifyToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Ensure payment structure exists
    if (!booking.payment) booking.payment = {};
    if (!booking.payment.commission)
      booking.payment.commission = { amount: 0, isSettled: false, settledAt: null };

    // 🚫 Already settled
    if (booking.payment.commission.isSettled) {
      return res.status(400).json({ message: "Commission already settled" });
    }

    // 🚫 No worker assigned
    if (!booking.IdWorker) {
      return res.status(400).json({ message: "Booking has no assigned worker" });
    }

    // 💰 Commission = 20% of EstimatedPrice
    const commission = Math.round(booking.EstimatedPrice * 0.2);

    // 🔄 Deduct from worker wallet via Worker Service
    try {
      await axios.post(`http://localhost:${PORTWORKER}/api/internal/worker/pay-commission`, {
        workerId: booking.IdWorker,
        amount: commission,
        bookingId: booking.bookingId,
      });
    } catch (err) {
      console.error("Worker pay-commission call failed:", err?.response?.data || err.message);
      return res.status(500).json({ message: "Failed to deduct commission from worker wallet" });
    }

    // ✅ Update booking.payment & commission details
    booking.payment.commission.amount = commission;
    booking.payment.commission.isSettled = true;
    booking.payment.commission.settledAt = new Date();

    // ✅ Also mark payment as 'paid' since full transaction (customer→us & worker→us) done
    booking.payment.status = "paid";
    booking.payment.paidAt = booking.payment.paidAt || new Date();

    // 🔐 Keep mode and paidBy consistent
    booking.payment.mode = booking.payment.mode || "online";
    booking.payment.paidBy = booking.payment.paidBy || "customer_to_us";

    await booking.save();

    res.json({
      success: true,
      message: "Commission settled and payment marked as paid successfully",
      booking: {
        ...booking.toObject(),
        payment: { ...booking.payment, method: booking.payment.mode },
      },
    });
  } catch (err) {
    console.error("❌ Commission settlement failed:", err.message);
    res.status(500).json({ message: "Failed to settle commission" });
  }
});




// ------------------------
// Start server
// ------------------------
app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on 0.0.0.0:${PORT}`));
