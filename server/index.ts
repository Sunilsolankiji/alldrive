import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import connectDB, { isDbConnected } from './config/db'
import authRoutes from './routes/auth'
import drivesRoutes from './routes/drives'
import filesRoutes from './routes/files'

void connectDB().then((connected) => {
  if (!connected) {
    console.warn(
      'Running without MongoDB connection. API routes will return 503 until the database is available.'
    )
  }
})

const app = express()

app.use(
  cors({
    // https://localhost is the Android app's (Capacitor) WebView origin
    origin: [process.env.CLIENT_URL || 'http://localhost:5173', 'https://localhost'],
    credentials: true,
  })
)
app.use(express.json())

app.use('/api', (_req, res, next) => {
  if (!isDbConnected()) {
    return res.status(503).json({
      message: 'Service is temporarily unavailable. Please try again shortly.',
    })
  }
  next()
})

app.use('/api/auth', authRoutes)
app.use('/api/drives', drivesRoutes)
app.use('/api/files', filesRoutes)

if (process.env.NODE_ENV === 'production') {
  // compiled to server/dist/index.js, so the client build is two levels up
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
  app.use(express.static(clientDist))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')))
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack)
  const statusCode = 500
  res.status(statusCode).json({ message: 'Something went wrong. Please try again.' })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
