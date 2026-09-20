const crypto = require('crypto');
const prisma = require('../lib/prisma');

// ===== Books =====

async function createBook(req, res) {
  try {
    const { board, grade, subject, title, edition } = req.body;

    if (!grade || !subject || !title) {
      return res.status(400).json({ error: 'grade, subject, and title are required' });
    }

    const book = await prisma.curriculumBook.create({
      data: {
        id: crypto.randomUUID(),
        board: board || 'NCERT',
        grade,
        subject,
        title,
        edition: edition || undefined
      }
    });

    res.status(201).json({ message: 'Book created', book });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A book with this board/grade/subject/title already exists' });
    }
    console.error('Create book error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

async function getBooks(req, res) {
  try {
    const books = await prisma.curriculumBook.findMany({
      orderBy: [{ grade: 'asc' }, { subject: 'asc' }]
    });
    res.json({ books });
  } catch (err) {
    console.error('Get books error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

// ===== Chapters =====

async function createChapter(req, res) {
  try {
    const { bookId, chapterNumber, title, learningObjectives } = req.body;

    if (!bookId || chapterNumber === undefined || !title) {
      return res.status(400).json({ error: 'bookId, chapterNumber, and title are required' });
    }

    const book = await prisma.curriculumBook.findUnique({ where: { id: bookId } });
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const chapter = await prisma.curriculumChapter.create({
      data: {
        id: crypto.randomUUID(),
        bookId,
        chapterNumber: parseInt(chapterNumber, 10),
        title,
        learningObjectives: learningObjectives || []
      }
    });

    res.status(201).json({ message: 'Chapter created', chapter });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A chapter with this number already exists for this book' });
    }
    console.error('Create chapter error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

async function getChaptersByBook(req, res) {
  try {
    const { bookId } = req.params;
    const chapters = await prisma.curriculumChapter.findMany({
      where: { bookId },
      orderBy: { chapterNumber: 'asc' }
    });
    res.json({ chapters });
  } catch (err) {
    console.error('Get chapters error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

// ===== Nodes (topics / files) =====

async function createNode(req, res) {
  try {
    const { chapterId, parentId, title, type, description, textContent, orderIndex } = req.body;

    if (!chapterId || !title || !type || orderIndex === undefined) {
      return res.status(400).json({ error: 'chapterId, title, type, and orderIndex are required' });
    }

    const validTypes = ['TEXT', 'PDF', 'PPT', 'VIDEO'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'type must be one of: TEXT, PDF, PPT, VIDEO' });
    }

    const chapter = await prisma.curriculumChapter.findUnique({ where: { id: chapterId } });
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    let content;
    if (type === 'TEXT') {
      if (!textContent) {
        return res.status(400).json({ error: 'textContent is required when type is TEXT' });
      }
      content = textContent;
    } else {
      // PDF / PPT / VIDEO — a file must have been uploaded
      if (!req.file) {
        return res.status(400).json({ error: `A file upload is required when type is ${type}` });
      }
      content = `/uploads/${req.file.filename}`;
    }

    const node = await prisma.curriculumNode.create({
      data: {
        id: crypto.randomUUID(),
        chapterId,
        parentId: parentId || undefined,
        title,
        type,
        description: description || undefined,
        content,
        orderIndex: parseInt(orderIndex, 10)
      }
    });

    res.status(201).json({ message: 'Topic created', node });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A topic with this order index already exists in this chapter' });
    }
    console.error('Create node error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

async function getNodesByChapter(req, res) {
  try {
    const { chapterId } = req.params;
    const nodes = await prisma.curriculumNode.findMany({
      where: { chapterId },
      orderBy: { orderIndex: 'asc' }
    });
    res.json({ nodes });
  } catch (err) {
    console.error('Get nodes error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = {
  createBook, getBooks,
  createChapter, getChaptersByBook,
  createNode, getNodesByChapter
};