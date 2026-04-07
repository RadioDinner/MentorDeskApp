const fs = require('fs')

let html = fs.readFileSync('index.html', 'utf8')

// Inject the Supabase anon key from environment variable
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'ANON_KEY_PLACEHOLDER'
html = html.replace('ANON_KEY_PLACEHOLDER', anonKey)

fs.mkdirSync('dist', { recursive: true })
fs.writeFileSync('dist/index.html', html)

console.log('Built landing page with anon key:', anonKey.slice(0, 10) + '...')
