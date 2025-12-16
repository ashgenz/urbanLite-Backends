// import dotenv from "dotenv"
// dotenv.config();
// import express from "express";
// import mongoose from "mongoose";
// import cors from "cors";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";

// const JWT_KEY=process.env.JWT_KEY;
// const app = express();
// app.use(cors());
// app.use(express.json());

// // Connect to MongoDB Atlas
// // Connect to MongoDB Atlas
// mongoose.connect(process.env.MONGO_URI_CUSTOMERS, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// })
// .then(() => {
//   console.log("✅ Connected to MongoDB Atlas");
// })
// .catch((err) => {
//   console.error("❌ MongoDB connection failed:", err.message);
//   process.exit(1); // Optional: exit the process if DB connection fails
// });


// // Schema & Model
// const UserSchema = new mongoose.Schema({
//   name: String,
//   Phone: { type: String, unique: true },
//   location: {
//     lat: Number,
//     lng: Number,
//   },
//   Password:String
// });


// const User = mongoose.model("User", UserSchema);
// app.post("/api/user/check-phone", async (req, res) => {
//   const { phone } = req.body;
//   try {
//     const user = await User.findOne({ Phone: phone });
//     if (user) {
//       return res.json({ exists: true });
//     } else {
//       return res.json({ exists: false });
//     }
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ exists: false, error: "Server error" });
//   }
// });

// app.post("/api/user/forgot-password/reset-password", async (req, res) => {
//   const { phone, newPassword } = req.body;
//   try {
//     const user = await User.findOne({ Phone: phone });
//     if (!user) return res.status(404).json({ error: "User not found" });

//     const hashed = await bcrypt.hash(newPassword, 10);
//     user.Password = hashed;
//     await user.save();

//     res.status(200).json({ message: "Password updated successfully" });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Server error" });
//   }
// });


// // API route
// app.post("/api/user/signin", async (req, res) => {
//   const { Name, Phone, location,Password } = req.body;

//   try {
//     //  Check if user with this phone already exists
//     const existingUser = await User.findOne({ Phone });

//     if (existingUser) {
//       return res.status(409).send("false");
//     }
//     const hashedPassword=await bcrypt.hash(Password,10);
//     // If not found, create new user
//     const user = new User({ name: Name, Phone, location,Password:hashedPassword });
//     await user.save();

//     res.status(200).send("User saved");
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("DB error");
//   }
// });
// app.post('/api/user/login',async(req,res)=>{ 
//     const {Phone,Password}=req.body;

//     const user1 =await User.findOne({Phone});

//     if (!user1) return res.status(401).json({ message: 'User not found' });

//     const match = await bcrypt.compare(Password, user1.Password);
//     if (!match) return res.status(403).json({ message: 'Invalid credentials' });


//     const token = jwt.sign({ id: user1._id }, JWT_KEY, { expiresIn: '1h' });
//     res.json({ token, customerId: user1._id });
//  });
 

// app.get('/verify', verifyToken, (req, res) => {
//   res.json({ success: true, message: 'Token is valid', user: req.user });
// });
 
// function verifyToken(req,res,next){
//     const authHeader = req.headers['authorization'];
//     const token = authHeader && authHeader.split(' ')[1];

//     if (!token) return res.sendStatus(401);

//     jwt.verify(token, JWT_KEY, (err, user) => {
//         if (err) return res.sendStatus(403);
//         req.user = user;
//         next();
//     });
    
// }

// // Start server
// const PORT = process.env.PORTCUSTOMER;
// app.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT} LoginsBackend`);
// });




// server.js
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();
const JWT_KEY = process.env.JWT_KEY;

const allowedOrigins = [
  "http://localhost:5173",
  "https://urbanlite-react.onrender.com", // <-- change to your real frontend Render URL
  "https://tryurbanlite.in",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("CORS blocked origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
app.use(express.json());

// ------------------ MongoDB Connection ------------------
mongoose.connect(process.env.MONGO_URI_CUSTOMERS, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ Connected to MongoDB Atlas"))
.catch((err) => {
  console.error("❌ MongoDB connection failed:", err.message);
  process.exit(1);
});

// ------------------ Schemas ------------------
const UserSchema = new mongoose.Schema({
  name: String,
  Phone: { type: String, unique: true },
  location: { lat: Number, lng: Number },
  Password: String,
});

const ContactMessageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: String,
  Phone: String,
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);
const ContactMessage = mongoose.model("ContactMessage", ContactMessageSchema);

// ------------------ JWT Middleware ------------------
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// ------------------ Auth Routes ------------------

// Signup
app.post("/api/user/signin", async (req, res) => {
  const { Name, Phone, location, Password } = req.body;

  try {
    const existingUser = await User.findOne({ Phone });
    if (existingUser) return res.status(409).send("false");

    const hashedPassword = await bcrypt.hash(Password, 10);
    const user = new User({ name: Name, Phone, location, Password: hashedPassword });
    await user.save();

    res.status(200).send("User saved");
  } catch (err) {
    console.error(err);
    res.status(500).send("DB error");
  }
});

// Login
app.post("/api/user/login", async (req, res) => {
  const { Phone, Password } = req.body;

  try {
    const user = await User.findOne({ Phone });
    if (!user) return res.status(401).json({ message: "User not found" });

    const match = await bcrypt.compare(Password, user.Password);
    if (!match) return res.status(403).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, name: user.name, Phone: user.Phone }, JWT_KEY, { expiresIn: "1h" });
    res.json({ token, customerId: user._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Verify token
app.get("/verify", verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ------------------ Contact Us Routes ------------------

// Send message
app.post("/api/user/contact", verifyToken, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ message: "Message is required" });

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const newMsg = new ContactMessage({
      userId: user._id,
      name: user.name,
      Phone: user.Phone,
      message,
    });

    await newMsg.save();
    res.status(201).json({ message: "Message saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all messages of logged-in user
app.get("/api/user/contact", verifyToken, async (req, res) => {
  try {
    const messages = await ContactMessage.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------ Forgot Password ------------------
app.post("/api/user/forgot-password/reset-password", async (req, res) => {
  const { phone, newPassword } = req.body;
  try {
    const user = await User.findOne({ Phone: phone });
    if (!user) return res.status(404).json({ error: "User not found" });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.Password = hashed;
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
// Keep-Alive Endpoint
app.get('/ping', (req, res) => {
  res.status(200).send('Pong');
});
// ------------------ Check Phone ------------------
app.post("/api/user/check-phone", async (req, res) => {
  const { phone } = req.body;
  try {
    const user = await User.findOne({ Phone: phone });
    res.json({ exists: !!user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ exists: false, error: "Server error" });
  }
});

// Start server
const PORT = process.env.PORTCUSTOMER;
app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on 0.0.0.0:${PORT}`));
