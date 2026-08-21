import express from 'express';
import dotenv from 'dotenv';
import { reportQueue } from './Controllers/queue.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.json({ limit: '10mb' })); 


app.post('/api/reports', async (req, res, next) => {
  try {
    const { reportId, items } = req.body || {};


    if (!reportId || typeof reportId !== 'string') {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'A valid string "reportId" is required.' 
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'A non-empty "items" array is required.' 
      });
    }


    const job = await reportQueue.add(
      'pdf-generation', 
      { reportId, items },
      { jobId: `report-${reportId}-${Date.now()}` }
    );


    return res.status(202).json({
      message: 'Report generation queued successfully',
      jobId: job.id,
      statusUrl: `/api/reports/${job.id}/status`
    });
  } catch (error) {
    next(error);
  }
});


app.get('/api/reports/:jobId/status', async (req, res, next) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID parameter is required' });
    }

    const job = await reportQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found or expired' });
    }

    const state = await job.getState(); 
    const progress = typeof job.progress === 'number' ? job.progress : 0;

    if (state === 'completed') {
      return res.json({
        status: 'completed',
        progress: 100,
        result: job.returnvalue || null
      });
    }

    if (state === 'failed') {
      return res.status(500).json({
        status: 'failed',
        reason: job.failedReason || 'Unknown execution error'
      });
    }

    return res.json({ 
      status: state, 
      progress 
    });
  } catch (error) {
    next(error);
  }
});


app.use((err, req, res, next) => {
  console.error('[API Error]:', err.stack || err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred.'
  });
});


const server = app.listen(PORT, () => {
  console.log(`API Server listening on http://localhost:${PORT}`);
});

const shutdown = async () => {
  console.log('\nClosing Express server and queue connections...');
  server.close(async () => {
    try {
      await reportQueue.close();
      console.log('HTTP Server and Queue connections closed gracefully.');
      process.exit(0);
    } catch (err) {
      console.error('Error closing queue during shutdown:', err);
      process.exit(1);
    }
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);