
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/qr_samples', express.static(path.join(__dirname, 'qr_samples')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/leaderboard.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/info.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'info.html')));
app.get('/qrs.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'qrs.html')));
app.get('/admin-profile.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-profile.html')));

// ═══════════════════════════════════════════════════════════
//  DATA PERSISTENCE — JSON file-based storage
// ═══════════════════════════════════════════════════════════
const DB_PATH = path.join(__dirname, 'db.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      const data = JSON.parse(raw);
      return data;
    }
  } catch (e) {
    console.error('DB_LOAD_ERR:', e.message);
  }
  return { users: {}, rewards: null };
}

function saveDB() {
  try {
    const data = JSON.stringify({ users, rewards }, null, 2);
    fs.writeFileSync(DB_PATH, data, 'utf-8');
  } catch (e) {
    // Vercel has read-only filesystem — silently fail
    console.error('DB_SAVE_ERR:', e.message);
  }
}

// Load persisted data on startup
const db = loadDB();
let users = db.users || {};

let rewards = db.rewards || {
  'samosa': { name: "Free Samosa", points: 75, desc: "On purchase of ₹99+ at Campus Cafe" },
  'coffee': { name: "50% BrewPoint", points: 50, desc: "Half price on any hot beverage" },
  'priority': { name: "Priority Pass", points: 100, desc: "Skip the queue for 24 hours" },
  'prints': { name: "5 Free Prints", points: 30, desc: "Black & White prints at Central Library" },
  'gym': { name: "Gym Day Pass", points: 150, desc: "Full access to fitness center" },
  'meal': { name: "Meal Discount", points: 200, desc: "₹50 off on any meal over ₹150" },
  'waive': { name: "Fee Waiver", points: 100, desc: "Waive up to ₹20 in library fines" }
};

// ═══════════════════════════════════════════════════════════
//  ACHIEVEMENTS / BADGES SYSTEM
// ═══════════════════════════════════════════════════════════
const BADGES = {
  first_steps:    { name: "First Steps",     icon: "🥾", desc: "Scan your first floor",              condition: u => u.totalScans >= 1 },
  floor_five:     { name: "Summit Seeker",    icon: "🏔️", desc: "Reach floor 5 or higher",           condition: u => u.highestFloor >= 5 },
  ten_scans:      { name: "Dedicated Climber",icon: "🧗", desc: "Complete 10 floor scans",            condition: u => u.totalScans >= 10 },
  fifty_scans:    { name: "Stair Master",     icon: "⚡", desc: "Complete 50 floor scans",            condition: u => u.totalScans >= 50 },
  point_hoarder:  { name: "Point Hoarder",    icon: "💎", desc: "Accumulate 500+ total points",       condition: u => u.totalPointsEarned >= 500 },
  first_claim:    { name: "First Claim",      icon: "🎁", desc: "Redeem your first reward",           condition: u => u.inventory.length >= 1 },
  big_spender:    { name: "Big Spender",      icon: "💸", desc: "Redeem 5 rewards",                   condition: u => u.inventory.length >= 5 },
  week_warrior:   { name: "Week Warrior",     icon: "🔥", desc: "Achieve a 7-day streak",             condition: u => u.bestStreak >= 7 },
  month_legend:   { name: "Monthly Legend",   icon: "👑", desc: "Achieve a 30-day streak",            condition: u => u.bestStreak >= 30 },
  elite_rank:     { name: "Elite Mountaineer",icon: "🏆", desc: "Reach the Elite Mountaineer rank",   condition: u => u.points >= 500 },
};

function checkBadges(user) {
  if (!user.badges) user.badges = [];
  const newBadges = [];

  for (const [id, badge] of Object.entries(BADGES)) {
    if (!user.badges.includes(id) && badge.condition(user)) {
      user.badges.push(id);
      newBadges.push({ id, name: badge.name, icon: badge.icon });
    }
  }

  return newBadges;
}

// ═══════════════════════════════════════════════════════════
//  STREAK SYSTEM
// ═══════════════════════════════════════════════════════════
function getDateStr(date) {
  // Returns YYYY-MM-DD in local timezone
  return new Date(date).toISOString().split('T')[0];
}

function updateStreak(user) {
  const today = getDateStr(new Date());

  if (!user.streakData) {
    user.streakData = { lastActiveDate: null, currentStreak: 0, bestStreak: 0, activeDays: [] };
  }

  const streak = user.streakData;

  // Already logged today
  if (streak.lastActiveDate === today) return;

  const yesterday = getDateStr(new Date(Date.now() - 86400000));

  if (streak.lastActiveDate === yesterday) {
    // Consecutive day — extend streak
    streak.currentStreak += 1;
  } else {
    // Streak broken — reset to 1
    streak.currentStreak = 1;
  }

  streak.lastActiveDate = today;
  if (streak.currentStreak > streak.bestStreak) {
    streak.bestStreak = streak.currentStreak;
  }

  // Track active days for heatmap (keep last 90 days)
  if (!streak.activeDays.includes(today)) {
    streak.activeDays.push(today);
    if (streak.activeDays.length > 90) streak.activeDays.shift();
  }

  // Sync top-level for badge checks
  user.bestStreak = streak.bestStreak;

  // Award streak bonus points
  const bonusTable = { 3: 10, 7: 25, 14: 50, 30: 100 };
  const bonus = bonusTable[streak.currentStreak];
  if (bonus) {
    user.points += bonus;
    user.totalPointsEarned = (user.totalPointsEarned || 0) + bonus;
    const time = new Date().toLocaleTimeString();
    user.history.unshift({ floor: `🔥 ${streak.currentStreak}-day streak bonus! +${bonus}`, time });
  }
}

// ═══════════════════════════════════════════════════════════
//  USER MANAGEMENT
// ═══════════════════════════════════════════════════════════
function getUser(regNo) {
  if (!regNo) return null;
  if (!users[regNo]) {
    users[regNo] = {
      regNo: regNo,
      points: 0,
      totalPointsEarned: 0,
      totalScans: 0,
      highestFloor: 0,
      bestStreak: 0,
      lastFloor: null,
      history: [],
      inventory: [],
      badges: [],
      streakData: { lastActiveDate: null, currentStreak: 0, bestStreak: 0, activeDays: [] },
      createdAt: new Date().toISOString()
    };
    saveDB();
  }
  return users[regNo];
}

// ═══════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════

app.post('/login', (req, res) => {
  const { regNo } = req.body;
  if (!regNo) return res.status(400).json({ error: "Registration number required" });
  const user = getUser(regNo);
  res.json(user);
});

app.post('/scan', (req, res) => {
  const { floor, regNo } = req.body;
  const user = getUser(regNo);

  if (!user) return res.status(412).json({ error: "User session lost. Please login again." });

  const floorNum = parseInt(floor);

  if (isNaN(floorNum)) {
    return res.json({ error: "Invalid QR data!" });
  }

  if (user.lastFloor === floorNum) {
    return res.json({ error: "Already logged this floor!" });
  }

  if (user.lastFloor !== null && Math.abs(floorNum - user.lastFloor) !== 1) {
    return res.json({ error: "Invalid movement! Please use the stairs step-by-step." });
  }

  // Award base points
  user.points += 5;
  user.totalPointsEarned = (user.totalPointsEarned || 0) + 5;
  user.totalScans = (user.totalScans || 0) + 1;
  user.lastFloor = floorNum;

  // Track highest floor
  if (floorNum > (user.highestFloor || 0)) {
    user.highestFloor = floorNum;
  }

  const time = new Date().toLocaleTimeString();
  user.history.unshift({ floor: floorNum, time });

  // Update streak
  updateStreak(user);

  // Check for new badges
  const newBadges = checkBadges(user);

  // Persist
  saveDB();

  const response = {
    points: user.points,
    message: `✅ Floor ${floorNum} recorded! +5 points`
  };

  if (newBadges.length > 0) {
    response.newBadges = newBadges;
    response.message += ` | 🏅 New badge: ${newBadges.map(b => b.icon + ' ' + b.name).join(', ')}`;
  }

  res.json(response);
});

app.get('/rewards', (req, res) => {
  res.json(rewards);
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD || '123456';
  if (password === adminPass) {
    res.json({ success: true, message: "Admin access granted" });
  } else {
    res.status(401).json({ error: "Unauthorized access" });
  }
});

app.post('/admin/add-reward', (req, res) => {
  const { id, name, points, desc } = req.body;
  if (!id || !name || !points || !desc) return res.status(400).json({ error: "All fields required" });
  rewards[id] = { name, points: parseInt(points), desc };
  saveDB();
  res.json({ message: "Reward added successfully!", rewards });
});

app.get('/api/leaderboard', (req, res) => {
  const leaderboard = Object.values(users)
    .map(u => ({
      regNo: u.regNo,
      points: u.points,
      lastFloor: u.lastFloor,
      totalScans: u.totalScans || 0,
      streak: u.streakData ? u.streakData.currentStreak : 0,
      badges: (u.badges || []).length
    }))
    .sort((a, b) => b.points - a.points)
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

    // Check for new badges after redemption
    const newBadges = checkBadges(user);
    saveDB();

    const response = { message: `${reward.name} Redeemed!`, points: user.points };
    if (newBadges.length > 0) {
      response.newBadges = newBadges;
    }

    return res.json(response);
  }

  res.json({ error: "Insufficient points" });
});

app.get('/data', (req, res) => {
  const { regNo } = req.query;
  const user = getUser(regNo);
  if (!user) return res.status(400).json({ error: "Registration number required" });

  // Attach badge metadata for the frontend
  const badgeDetails = (user.badges || []).map(id => ({
    id,
    ...BADGES[id] ? { name: BADGES[id].name, icon: BADGES[id].icon, desc: BADGES[id].desc } : {}
  }));

  res.json({
    ...user,
    badgeDetails,
    allBadges: Object.entries(BADGES).map(([id, b]) => ({
      id, name: b.name, icon: b.icon, desc: b.desc,
      unlocked: (user.badges || []).includes(id)
    }))
  });
});

// Admin stats endpoint
app.get('/admin/stats', (req, res) => {
  const allUsers = Object.values(users);
  const today = getDateStr(new Date());

  const todayScans = allUsers.reduce((sum, u) => {
    const todayEntries = (u.history || []).filter(h => {
      return typeof h.floor === 'number';
    });
    return sum + todayEntries.length;
  }, 0);

  res.json({
    totalUsers: allUsers.length,
    totalScansAllTime: allUsers.reduce((s, u) => s + (u.totalScans || 0), 0),
    totalRedemptions: allUsers.reduce((s, u) => s + (u.inventory || []).length, 0),
    activeStreaks: allUsers.filter(u => u.streakData && u.streakData.currentStreak >= 2).length,
    longestStreak: Math.max(0, ...allUsers.map(u => u.bestStreak || 0)),
    topBadgeHolder: allUsers.reduce((best, u) => (u.badges || []).length > (best.badges || []).length ? u : best, { badges: [], regNo: 'N/A' }).regNo
  });
});

// The port will handle itself on Vercel
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));

module.exports = app;
