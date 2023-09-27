const express = require('express')
const router = express.Router()
const os = require('os')

const handler = function (res, word) {
  res.end(word)
}

router.get('/live', function (req, res, next) {
  handler(res, 'Live!\n' + os.hostname() + '\n' + (new Date().toLocaleString('ru')))
})

router.get('/ready', function (req, res, next) {
  handler(res, 'Ready!')
})

router.get('/startup', function (req, res, next) {
  handler(res, 'Started!')
})

module.exports = router
