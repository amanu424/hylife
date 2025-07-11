require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');
const bodyParser = require("body-parser")
const path = require('path');
const app = express();

const cors = require('cors');
const User = require('./models/User');
const Admin = require('./models/Admin');


app.use(cors());
// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary storage configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'macromex',
    allowed_formats: ['jpg', 'jpeg', 'png']
  }
});

const upload = multer({ storage: storage });

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, "public")));


// Session configuration with MongoDB store
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 14 * 24 * 60 * 60, // = 14 days. Default
    autoRemove: 'native', // Remove expired sessions automatically
    touchAfter: 24 * 3600 // time period in seconds
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
  }
}));

app.use(flash());

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.isAuthenticated) {
    next();
  } else {
    req.flash('error', 'Please login first');
    res.redirect('/login');
  }
};

// Local-only middleware
const isLocalhost = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
    next();
  } else {
    res.status(403).send('This route is only available locally');
  }
};

// Routes
app.get('/results', async (req, res) => {
  try {
    const users = await User.find();
    console.log(req.session.isAuthenticated, "is auth");
    res.render('results', { 
      users, 
      error: req.flash('error'), 
      success: req.flash('success'),
      isAuthenticated: req.session.isAuthenticated 
    });
  } catch (error) {
    req.flash('error', 'Error fetching users');
    res.redirect('/');
  }
});

app.get('/', (req, res) => {
  res.render('hylife', { error: req.flash('error') });
});

app.get('/login', (req, res) => {
  res.render('login', { error: req.flash('error') });
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const allUsers = await Admin.find(); 
    const admin = await Admin.findOne({ email: username });
    console.log(allUsers, "all users");
    // if (admin && await bcrypt.compare(password, admin.password)) {
    //   req.session.isAuthenticated = true;
    //   res.redirect('/');
    // } else {
    //   req.flash('error', 'Invalid credentials');
    //   res.redirect('/login');
    // }
    if (admin) {
      req.session.isAuthenticated = true;
      // res.redirect('/');
      res.status(200).json({ success: true, message: 'Login successful' });
      // res.redirect('/');
    } else {
      req.flash('error', 'Invalid credentials');
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
      res.redirect('/login');
    }
  } catch (error) {
    req.flash('error', 'Error during login');
    return res.status(500).json({ success: false, message: 'Error during login' });
    res.redirect('/login');
  }
});

// Local-only admin registration route
app.get('/register-admin', isLocalhost, (req, res) => {
  res.render('register-admin', { error: req.flash('error'), success: req.flash('success') });
});

app.post('/register-admin', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      req.flash('error', 'Admin with this email already exists');
      return res.redirect('/register-admin');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new admin
    const admin = new Admin({
      email,
      password: hashedPassword
    });

    await admin.save();
    req.flash('success', 'Admin registered successfully');
    res.redirect('/login');
  } catch (error) {
    req.flash('error', 'Error registering admin');
    res.redirect('/register-admin');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/results');
});

app.post('/users', upload.single('image'), async (req, res) => {
  try {
  
    const { name, age, phoneNumber, status } = req.body;

    if (!name || !age || !phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Image is required'
      });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'macromex',
      transformation: [
        { width: 100, crop: "limit" },
        { quality: "auto" }
      ]
    });

    const user = new User({
      name,
      image: result.secure_url,
      age,
      phoneNumber,
      status: status || 'pending'
    });
    
    await user.save();
    res.json({ success: true, message: 'User added successfully', user });
  } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).json({ success: false, message: 'Error adding user', error: error.message });
  }
});

app.put('/users/:id', isAuthenticated, upload.single('image'), async (req, res) => {
  try {
    const { name, age, phoneNumber, status } = req.body;
    const updateData = { name, age, phoneNumber, status };
    if (req.file) {
      updateData.image = req.file.path;
    }
    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ success: true, message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating user', error: error.message });
  }
});

app.delete('/users/:id', isAuthenticated, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting user', error: error.message });
  }
});


app.post("/beyene", async(req, res) => {
    console.log(req.body);
    res.json({ data: `bey ${req.body.beyene} Tebeynual`})
})

app.get("/*", (req, res) => {
  res.redirect("/")
})
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
