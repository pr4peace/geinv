import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'
import path from 'path'

// Explicitly load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY not found in .env.local')
    return
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  
  const testModels = [
    'gemini-1.5-pro',
    'gemini-1.5-pro-002',
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-3.1-pro',
    'gemini-3.5-flash',
    'gemini-3.5-pro'
  ]

  for (const m of testModels) {
    process.stdout.write(`Testing ${m}... `)
    try {
      const model = genAI.getGenerativeModel({ model: m })
      // Use a very simple prompt to check existence/permission
      await model.generateContent({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] })
      process.stdout.write('✅ WORKING\n')
    } catch (err: any) {
      process.stdout.write(`❌ FAILED: ${err.message.split('\n')[0]}\n`)
    }
  }
}

listModels()
