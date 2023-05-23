const express = require('express')
const router = express.Router()
const formidable = require('formidable')
const XLSX = require('xlsx')
const fs = require('fs')
const { PDFDocument, rgb } = require('pdf-lib')
const fontkit = require('@pdf-lib/fontkit')
const bwipjs = require('bwip-js')
const drawsvg = require('../drawing-svg')
const { XMLParser } = require('fast-xml-parser')
const contentDisposition = require('content-disposition')
const dayjs = require('dayjs')
const JSZip = require('jszip')

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Wildberries label maker' })
})

const parseXLSX = async function (data) {
  // open a font synchronously
  const workbook = XLSX.read(data)
  const ws = workbook.Sheets[workbook.SheetNames[0]]
  let rowNumber = 2
  const result = []
  while (true) {
    if (typeof (ws['A' + rowNumber]) === 'undefined') break
    result.push({
      text: [
        ws['A' + rowNumber].v,
        ws['B' + rowNumber].v,
        'Арт. ' + ws['C' + rowNumber].v
      ],
      subtext: [
        'Производитель: ' + ws['D' + rowNumber].v
      ],
      barcode: ws['E' + rowNumber].v,
      articleNumber: ws['C' + rowNumber].v,
      englishName: ws['B' + rowNumber].v
    })
    rowNumber++
  }
  return result
}

const createPdf = async function (data) {
  const dpiScale = 595 / 210
  const shiftX = 8
  const fontData = fs.readFileSync('./files/font.ttf')
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const customFont = await pdfDoc.embedFont(fontData)

  const page = pdfDoc.addPage([58 * dpiScale, 40 * dpiScale])

  let textSize = 12
  while (true) {
    let sizeOk = true
    for (let i = 0; i < data.text.length; i++) {
      const line = data.text[i]
      if (customFont.widthOfTextAtSize(line, textSize) > (page.getWidth() - shiftX * 2)) {
        textSize -= 0.5
        sizeOk = false
        break
      }
    }
    if (sizeOk) {
      break
    }
  }

  let subtextSize = textSize
  while (true) {
    let sizeOk = true
    for (let i = 0; i < data.subtext.length; i++) {
      const line = data.subtext[i]
      if (customFont.widthOfTextAtSize(line, subtextSize) > (page.getWidth() - shiftX * 2)) {
        subtextSize -= 0.5
        sizeOk = false
        break
      }
    }
    if (sizeOk) {
      break
    }
  }

  let shiftY = page.getHeight() - 2
  for (const line of data.text) {
    shiftY -= customFont.heightAtSize(textSize)
    page.drawText(line, {
      x: shiftX,
      y: shiftY,
      size: textSize,
      font: customFont,
      color: rgb(0, 0, 0)
    })
  }

  shiftY -= customFont.heightAtSize(textSize)
  for (const line of data.subtext) {
    shiftY -= customFont.heightAtSize(subtextSize)
    page.drawText(line, {
      x: shiftX,
      y: shiftY,
      size: subtextSize,
      font: customFont,
      color: rgb(0, 0, 0)
    })
  }

  shiftY -= customFont.heightAtSize(subtextSize) * 2
  const opts = {
    bcid: 'ean13',
    text: data.barcode,
    includetext: true,
    height: shiftY / dpiScale,
    scaleY: 1,
    scaleX: 1
  }
  bwipjs.fixupOptions(opts)
  const svg = bwipjs.render(opts, drawsvg(opts, bwipjs.FontLib))
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
    attributeNamePrefix: '',
    allowBooleanAttributes: true
  })
  const svgParsed = parser.parse(svg)
  for (const p of svgParsed.svg.path) {
    const svgOpt = {
      x: Math.floor((page.getWidth() - svgParsed.svg.width) / 2),
      y: svgParsed.svg.height + 2
    }
    if (typeof (p['stroke-width']) !== 'undefined') {
      const w = p['stroke-width']
      svgOpt.borderWidth = w
      if (w === 2) { svgOpt.x += 1 } else if (w === 4) { svgOpt.x += 1 }
    }
    if (typeof (p.fill) !== 'undefined') { svgOpt.color = rgb(0, 0, 0) }
    page.drawSvgPath(p.d, svgOpt)
  }
  return {
    filename: data.englishName + ' ' + data.articleNumber + '.pdf',
    data: await pdfDoc.save()
  }
}

const createZip = async function (data) {
  const zip = new JSZip()
  for (const file of data) {
    zip.file(file.filename, file.data)
  }
  const zipBytes = await zip.generateAsync({ type: 'nodebuffer' })
  return zipBytes
}

router.post('/', async function (req, res, next) {
  const form = formidable({ multiples: true })
  const files = await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err)
        return
      }
      resolve(files)
    })
  })
  const xlsxBytes = fs.readFileSync(files.file.filepath)
  const labels = await parseXLSX(xlsxBytes)
  const pdfFiles = []
  for (const label of labels) {
    pdfFiles.push(await createPdf(label))
  }
  if (pdfFiles.length === 1) {
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(pdfFiles[0].filename)
    })
    res.write(pdfFiles[0].data)
    res.end()
  } else if (pdfFiles.length > 1) {
    const zip = await createZip(pdfFiles)
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': contentDisposition(dayjs().format('YYYYMMDD_HHmmss') + '.zip')
    })
    res.write(zip)
    res.end()
  } else {
    res.render('index', { title: 'Upload' })
  }
})

module.exports = router
