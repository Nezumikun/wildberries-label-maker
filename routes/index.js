const express = require('express')
const router = express.Router()

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Wildberries label maker' })
})

router.post('/', function (req, res, next) {
  res.render('index', { title: 'Upload' })
})

module.exports = router
