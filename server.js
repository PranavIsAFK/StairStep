
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/qr_samples', express.static(path.join(__dirname, 'qr_samples')));

// Important: These routes tell Vercel to serve your frontpage correctly
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let users = {};
let rewards = {
  'samosa': { name: "Free Samosa", points: 75, desc: "On purchase of ₹99+ at Campus Cafe" },
  'coffee': { name: "50% BrewPoint", points: 50, desc: "Half price on any hot beverage" },
  'priority': { name: "Priority Pass", points: 100, desc: "Skip the queue for 24 hours" },
  'prints': { name: "5 Free Prints", points: 30, desc: "Black & White prints at Central Library" },
  'gym': { name: "Gym Day Pass", points: 150, desc: "Full access to fitness center" },
  'meal': { name: "Meal Discount", points: 200, desc: "₹50 off on any meal over ₹150" },
  'waive': { name: "Fee Waiver", points: 100, desc: "Waive up to ₹20 in library fines" }
};

function getUser(regNo) {
  if (!regNo) return null;
  if (!users[regNo]) {
    users[regNo] = {
      regNo: regNo,
      points: 0,
      lastFloor: null,
      history: [],
      inventory: []
    };
  }
  return users[regNo];
}

app.post('/login', (req, res) => {
  const { regNo } = req.body;
  if (!regNo) return res.status(400).json({ error: "Registration number required" });
  const user = getUser(regNo);
  res.json(user);
});

app.post('/scan', (req,res)=>{
  const { floor, regNo } = req.body;
  const user = getUser(regNo);
  
  if (!user) return res.status(412).json({ error: "User session lost. Please login again." });

  const floorNum = parseInt(floor);

  if (isNaN(floorNum)) {
    return res.json({error: "Invalid QR data!"});
  }

  if (user.lastFloor === floorNum) {
    return res.json({error: "Already logged this floor!"});
  }

  if (user.lastFloor !== null && Math.abs(floorNum - user.lastFloor) !== 1){
    return res.json({error: "Invalid movement! Please use the stairs step-by-step."});
  }

  user.points += 5;
  user.lastFloor = floorNum;
  const time = new Date().toLocaleTimeString();
  user.history.unshift({floor: floorNum, time}); 

  res.json({points: user.points, message: `✅ Floor ${floorNum} recorded! +5 points`});
});

app.get('/rewards', (req, res) => {
  res.json(rewards);
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === '123456') {
    res.json({ success: true, message: "Admin access granted" });
  } else {
    res.status(401).json({ error: "Unauthorized access" });
  }
});

app.post('/admin/add-reward', (req, res) => {
  const { id, name, points, desc } = req.body;
  if (!id || !name || !points || !desc) return res.status(400).json({ error: "All fields required" });
  rewards[id] = { name, points: parseInt(points), desc };
  res.json({ message: "Reward added successfully!", rewards });
});

app.get('/leaderboard', (req, res) => {
  const leaderboard = Object.values(users)
    .sort((a,b) => b.points - a.points)
    .slice(0, 10); // Top 10
  res.json(leaderboard);
});

app.post('/redeem', (req, res) => {
  const { rewardId, regNo } = req.body;
  const user = getUser(regNo);
  const reward = rewards[rewardId];

  if (!user) return res.status(412).json({ error: "User session lost." });
  if (!reward) {
    return res.json({ error: "Invalid reward selection" });
  }

  if (user.points >= reward.points) {
    user.points -= reward.points;
    const time = new Date().toLocaleTimeString();
    const date = new Date().toLocaleDateString();
    
    // Add to history
    user.history.unshift({ floor: `Redeemed: ${reward.name}`, time });
    
    // Add to inventory
    user.inventory.unshift({
      id: rewardId,
      name: reward.name,
      points: reward.points,
      date,
      time,
      voucherCode: 'ST-' + Math.random().toString(36).substr(2, 6).toUpperCase()
    });

    return res.json({ message: `${reward.name} Redeemed!`, points: user.points });
  }

  res.json({ error: "Insufficient points" });
});

app.get('/data', (req, res) => {
  const { regNo } = req.query;
  const user = getUser(regNo);
  if (!user) return res.status(400).json({ error: "Registration number required" });
  res.json(user);
});

// The port will handle itself on Vercel
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log(`Running on port ${PORT}`));
