require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const schoolRoutes = require('./routes/schoolRoutes');
const { requireAdmin } = require('./middleware/authMiddleware');
const classRoutes = require('./routes/classRoutes');
const courseRoutes = require('./routes/courseRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const studentRoutes = require('./routes/studentRoutes');
const rbacRoutes = require('./routes/rbacRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', authRoutes);
app.use('/api', schoolRoutes);
app.use('/api', classRoutes);
app.use('/api', courseRoutes);
app.use('/api', subjectRoutes);
app.use('/api', teacherRoutes);
app.use('/api', studentRoutes);
app.use('/api', rbacRoutes);

// Health check — confirms the server is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'EduAdapt backend is running' });
});

app.get('/api/admin/test', requireAdmin, (req, res) => {
  res.json({ message: 'You are authenticated as admin', user: req.user });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});