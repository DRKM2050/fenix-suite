/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/**/*.html",
    "./src/renderer/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          750: '#273549',
          850: '#131d31',
        }
      }
    },
  },
  plugins: [],
}
