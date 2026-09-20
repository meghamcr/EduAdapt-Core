const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const {
  createBook, getBooks,
  createChapter, getChaptersByBook,
  createNode, getNodesByChapter
} = require('../controllers/curriculumController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const allowedMimeTypes = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4',
  'video/webm',
  'video/quicktime'
];

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, PPT/PPTX, and MP4/WebM/MOV video files are allowed'));
    }
  }
});

router.post('/curriculum/books', requireAdmin, createBook);
router.get('/curriculum/books', requireAdmin, getBooks);

router.post('/curriculum/chapters', requireAdmin, createChapter);
router.get('/curriculum/books/:bookId/chapters', requireAdmin, getChaptersByBook);

router.post('/curriculum/nodes', requireAdmin, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, createNode);
router.get('/curriculum/chapters/:chapterId/nodes', requireAdmin, getNodesByChapter);

module.exports = router;